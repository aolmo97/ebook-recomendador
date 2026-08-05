declare module "input" {
  function text(prompt: string): Promise<string>;
  const _default: { text: typeof text };
  export default _default;
}
