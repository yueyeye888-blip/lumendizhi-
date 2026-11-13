#!/usr/bin/env python3
"""Deploy the complete bundle to a Windows host over WinRM.

Credentials and runtime secrets are read only from environment variables.
They are never written to this repository or printed to stdout.
"""

from __future__ import annotations

import argparse
import base64
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
    run_ps(session, f"[IO.File]::WriteAllBytes('{remote_path}',[byte[]]@())", f"init-{label}")
    for offset in range(0, len(payload), 2_000):
        chunk = payload[offset : offset + 2_000]
        run_ps(
            session,
            (
                f"$b=[Convert]::FromBase64String('{chunk}');"
                f"$s=[IO.File]::Open('{remote_path}',[IO.FileMode]::Append);"
                "$s.Write($b,0,$b.Length);$s.Dispose()"
            ),
            f"upload-{label}-{offset // 2_000 + 1}",
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
