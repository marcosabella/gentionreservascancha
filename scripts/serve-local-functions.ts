// Run the real application handlers locally, without deploying remote functions.
const originalServe = Deno.serve;
type Handler = (request: Request) => Response | Promise<Response>;
const handlers = new Map<string, Handler>();
const names = ['login','create-user','get-all-users','update-user-role','toggle-user-status','delete-user','reset-user-password'];
for (const name of names) {
  Object.defineProperty(Deno, 'serve', { configurable: true, value: (handler: Handler) => { handlers.set(name, handler); } });
  await import(`../supabase/functions/${name}/index.ts`);
}
Object.defineProperty(Deno, 'serve', { configurable: true, value: originalServe });
originalServe({ hostname: '127.0.0.1', port: 56010 }, request => {
  const name = new URL(request.url).pathname.split('/').filter(Boolean).at(-1) ?? '';
  const handler = handlers.get(name);
  return handler ? handler(request) : new Response('Not found', { status: 404 });
});
