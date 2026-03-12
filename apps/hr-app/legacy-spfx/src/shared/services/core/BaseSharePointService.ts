import { SPHttpClient } from '@microsoft/sp-http';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { spfi, SPFI, SPFx } from '@pnp/sp';

export abstract class BaseSharePointService {
  protected sp: SPFI;
  protected context: WebPartContext;

  protected static readonly JSON_HEADERS: Record<string, string> = {
    'Accept': 'application/json;odata=nometadata',
    'Content-Type': 'application/json;odata=nometadata;charset=utf-8',
    'odata-version': '3.0'
  };

  constructor(context: WebPartContext) {
    this.context = context;
    this.sp = spfi().using(SPFx(context));
  }

  protected get baseUrl(): string {
    return this.context.pageContext.web.absoluteUrl;
  }

  protected cacheBuster(): string {
    return `_=${Date.now()}`;
  }

  protected addCacheBuster(url: string): string {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}${this.cacheBuster()}`;
  }

  protected async get<T>(url: string): Promise<T> {
    const finalUrl = this.addCacheBuster(url);
    const res = await this.context.spHttpClient.get(
      finalUrl,
      SPHttpClient.configurations.v1
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error('GET failed:', res.status, errorText);
      throw new Error(errorText || `GET ${res.status}`);
    }

    return res.json();
  }

  protected async post<T>(
    url: string,
    body?: any,
    extraHeaders: Record<string, string> = {}
  ): Promise<T> {
    const res = await this.context.spHttpClient.post(
      url,
      SPHttpClient.configurations.v1,
      {
        headers: { ...BaseSharePointService.JSON_HEADERS, ...extraHeaders },
        body: body !== undefined ? JSON.stringify(body) : undefined
      }
    );

    if (!res.ok) {
      let errorText = '';
      try {
        errorText = await res.text();
      } catch {
        errorText = `HTTP ${res.status}: ${res.statusText}`;
      }
      throw new Error(errorText);
    }

    const contentType = res.headers.get('content-type') || '';
    if (res.status === 204 || !contentType.includes('application/json')) {
      return undefined as T;
    }

    const text = await res.text();
    if (!text || !text.trim()) return undefined as T;

    try {
      const json = JSON.parse(text);
      return (json && (json.d ?? json)) as T;
    } catch {
      return undefined as T;
    }
  }

  protected async postWithoutResponse<T = void>(
    url: string,
    body?: any,
    extraHeaders: Record<string, string> = {}
  ): Promise<T> {
    const res = await this.context.spHttpClient.post(
      url,
      SPHttpClient.configurations.v1,
      {
        headers: { ...BaseSharePointService.JSON_HEADERS, ...extraHeaders },
        body: body !== undefined ? JSON.stringify(body) : undefined
      }
    );

    if (!res.ok) {
      let errorText = '';
      try {
        errorText = await res.text();
      } catch {
        errorText = `HTTP ${res.status}: ${res.statusText}`;
      }
      throw new Error(errorText);
    }

    return undefined as T;
  }
}