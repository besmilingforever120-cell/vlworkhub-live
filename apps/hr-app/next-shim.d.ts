declare module "next/link" {
  const Link: any;
  export default Link;
}

declare module "next/navigation" {
  export function useRouter(): {
    push: (href: string) => void;
    refresh: () => void;
  };
  export function usePathname(): string;
  export function useSearchParams(): {
    get: (name: string) => string | null;
  };
  export function useParams<T extends Record<string, string | string[]>>(): T;
  export function redirect(href: string): never;
}
