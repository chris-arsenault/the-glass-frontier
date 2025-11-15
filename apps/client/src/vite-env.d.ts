/// <reference types="vite/client" />

type ImportMetaEnv = {
  readonly VITE_API_TARGET?: string;
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
}

type ImportMeta = {
  readonly env: ImportMetaEnv;
}
