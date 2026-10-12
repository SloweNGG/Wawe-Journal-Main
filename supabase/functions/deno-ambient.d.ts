// Ambient type declarations for Deno runtime when inspected outside Deno LSP
declare const Deno: {
  env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
  };
};

declare module 'https://*' {
  const content: any;
  export default content;
  export const serve: any;
  export const createClient: any;
}
