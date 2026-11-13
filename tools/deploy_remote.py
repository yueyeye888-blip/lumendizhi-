#!/usr/bin/env python3
"""Deploy the complete bundle to a Windows host over WinRM.

Credentials and runtime secrets are read only from environment variables.
They are never written to this repository or printed to stdout.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path

import winrm


ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT / "app"
INSTALLER = ROOT / "scripts" / "install-windows.ps1"
STAGING_ROOT = r"C:\SafeTGStaging"


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"missing required environment variable: {name}")
    return value


def decode(value: bytes) -> str:
    return value.decode("utf-8", "ignore").strip()


def run_ps(session: winrm.Session, script: str, label: str) -> str:
    result = session.run_ps(script)
    output = decode(result.std_out)
    error = decode(result.std_err)
    if result.status_code:
        raise RuntimeError(f"{label} failed: {error or output}")
    if output:
        print(f"[{label}] {output}")
    return output


def upload_bytes(session: winrm.Session, remote_path: str, content: bytes, label: str) -> None:
    payload = base64.b64encode(content).decode("ascii")
    encoded_path = f"{remote_path}.upload.b64"
    chunk_size = 1_400
    run_ps(
        session,
        f"[IO.File]::WriteAllText('{encoded_path}','{payload[:chunk_size]}',[Text.Encoding]::ASCII)",
        f"init-{label}",
    )
    for offset in range(chunk_size, len(payload), chunk_size):
        chunk = payload[offset : offset + chunk_size]
        run_ps(
            session,
            f"[IO.File]::AppendAllText('{encoded_path}','{chunk}',[Text.Encoding]::ASCII)",
            f"upload-{label}-{offset // chunk_size + 1}",
        )
    expected_hash = hashlib.sha256(content).hexdigest().upper()
    run_ps(
        session,
        (
            f"$bytes=[Convert]::FromBase64String([IO.File]::ReadAllText('{encoded_path}'));"
            f"[IO.File]::WriteAllBytes('{remote_path}',$bytes);"
            f"Remove-Item -LiteralPath '{encoded_path}' -Force;"
            f"if ((Get-FileHash -Algorithm SHA256 -LiteralPath '{remote_path}').Hash -ne '{expected_hash}') "
            f"{{ throw 'SHA256 mismatch for {label}' }}"
        ),
        f"finalize-{label}",
    )


def runtime_config() -> dict[str, object]:
    def split(name: str) -> list[str]:
        return [item.strip() for item in os.environ.get(name, "").split(",") if item.strip()]

    return {
        "telegramBotToken": required_env("TELEGRAM_BOT_TOKEN"),
        "allowedChatIds": split("TELEGRAM_ALLOWED_CHAT_IDS"),
        "trustedSenderBotIds": split("TELEGRAM_TRUSTED_SENDER_BOT_IDS"),
        "notifyChatId": os.environ.get("TELEGRAM_NOTIFY_CHAT_ID", "").strip(),
        "targetUrl": os.environ.get("TARGET_URL", "https://addrs.xyz").strip(),
        "cdpPort": int(os.environ.get("SAFE_DEMO_CDP_PORT", "9333")),
        "orderCallbackUrl": required_env("ADDRESS_ORDER_CALLBACK_URL"),
        "orderCallbackToken": required_env("ADDRESS_ORDER_CALLBACK_TOKEN"),
        "siteAccessToken": required_env("SITES_SERVICE_ACCESS_TOKEN"),
        "paymentMode": os.environ.get("PAYMENT_MODE", "dry-run").strip().lower(),
        "bscRpcUrl": os.environ.get("BSC_RPC_URL", "https://bsc-dataseed.bnbchain.org").strip(),
        "bscUsdtContract": os.environ.get(
            "BSC_USDT_CONTRACT", "0x55d398326f99059fF775485246999027B3197955"
        ).strip(),
        "paymentMaxSingleUsdt": os.environ.get("PAYMENT_MAX_SINGLE_USDT", "5").strip(),
        "paymentMaxDailyUsdt": os.environ.get("PAYMENT_MAX_DAILY_USDT", "20").strip(),
        "paymentMinGasBnb": os.environ.get("PAYMENT_MIN_GAS_BNB", "0.001").strip(),
        "paymentLiveApproval": os.environ.get("PAYMENT_LIVE_APPROVAL", "").strip(),
    }


def upload_bundle(session: winrm.Session, config: dict[str, object]) -> None:
    files = [path for path in APP_ROOT.rglob("*") if path.is_file()]
    directories = {STAGING_ROOT, rf"{STAGING_ROOT}\app"}
    for path in files:
        relative_parent = path.relative_to(APP_ROOT).parent
        if str(relative_parent) != ".":
            directories.add(rf"{STAGING_ROOT}\app\{str(relative_parent).replace('/', chr(92))}")
    quoted = ",".join(f"'{item}'" for item in sorted(directories))
    run_ps(
        session,
        f"@({quoted}) | ForEach-Object {{ New-Item -ItemType Directory -Path $_ -Force | Out-Null }}",
        "create-staging",
    )

    upload_bytes(session, rf"{STAGING_ROOT}\install-windows.ps1", INSTALLER.read_bytes(), "installer")
    for path in files:
        relative = str(path.relative_to(APP_ROOT)).replace("/", "\\")
        upload_bytes(session, rf"{STAGING_ROOT}\app\{relative}", path.read_bytes(), relative)

    config_path = rf"{STAGING_ROOT}\runtime-config.json"
    upload_bytes(
        session,
        config_path,
        (json.dumps(config, ensure_ascii=False) + "\n").encode("utf-8"),
        "private-config",
    )
    run_ps(
        session,
        rf"""
$account = "$env:USERDOMAIN\$env:USERNAME"
& icacls.exe '{config_path}' /inheritance:r /grant:r "$account`:(F)" 'SYSTEM:(F)' | Out-Null
"protected"
""",
        "protect-staging-config",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-prerequisites", action="store_true")
    parser.add_argument("--demo-fill", action="store_true")
    args = parser.parse_args()

    host = required_env("SAFE_DEMO_HOST")
    user = required_env("SAFE_DEMO_USER")
    password = required_env("SAFE_DEMO_PASSWORD")
    session = winrm.Session(
        f"http://{host}:5985/wsman",
        auth=(user, password),
        transport="ntlm",
        read_timeout_sec=420,
        operation_timeout_sec=390,
    )

    config = runtime_config()
    upload_bundle(session, config)
    switches = []
    if args.skip_prerequisites:
        switches.append("-SkipPrerequisites")
    if args.demo_fill:
        switches.append("-DemoFill")
    switch_text = " ".join(switches)
    run_ps(
        session,
        rf"""
Set-ExecutionPolicy -Scope Process Bypass -Force
& '{STAGING_ROOT}\install-windows.ps1' `
  -ConfigFile '{STAGING_ROOT}\runtime-config.json' `
  -SourceRoot '{STAGING_ROOT}\app' `
  -InstallRoot 'C:\SafeTGDemo' {switch_text}
""",
        "install",
    )
    run_ps(
        session,
        rf"Remove-Item '{STAGING_ROOT}\runtime-config.json' -Force -ErrorAction SilentlyContinue; 'staging secret removed'",
        "cleanup-staging-secret",
    )
    print("[complete] Windows receiver, Chrome CDP and scheduled tasks are ready")


if __name__ == "__main__":
    main()
