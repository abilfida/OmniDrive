import type { Env, OAuthTokens } from '../types/env';
import { AppError } from '../middleware/error-handler';

export class AuthService {
  constructor(private env: Env) {}

  async exchangeCodeForTokens(code: string, redirectUri: string, codeVerifier?: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      code,
      client_id: this.env.GOOGLE_CLIENT_ID,
      client_secret: this.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    if (codeVerifier) {
      params.append('code_verifier', codeVerifier);
    }
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OAuth token exchange failed:', error);
      throw new AppError(401, 'Failed to exchange authorization code');
    }

    const data = await response.json() as any;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }

  async fetchUserInfo(accessToken: string): Promise<{ id: string; email: string; name: string; picture: string }> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new AppError(401, 'Failed to fetch user info from Google');
    }

    return response.json() as any;
  }
}
