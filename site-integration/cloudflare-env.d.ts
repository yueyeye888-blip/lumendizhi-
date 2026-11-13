declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ESIM_ACCESS_CODE?: string;
    ESIM_SECRET_KEY?: string;
    RESOURCE_ADMIN_EMAILS?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
    SETTINGS_ENCRYPTION_KEY?: string;
    RESEND_API_KEY?: string;
    DELIVERY_EMAIL_FROM?: string;
    OPENAI_API_KEY?: string;
    ADDRESS_TRANSLATION_MODEL?: string;
    ADDRESS_ORDER_CALLBACK_TOKEN?: string;
  }
}
