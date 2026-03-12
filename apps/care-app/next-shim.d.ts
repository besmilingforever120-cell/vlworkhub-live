declare module "next/link" {
  const Link: any;
  export default Link;
}

declare module "next/navigation" {
  export function useRouter(): {
    push: (href: string) => void;
    refresh: () => void;
  };
  export function redirect(href: string): never;
}
