import { responseBody } from './app.js';

const server = Bun.serve({
  port: Number(process.env.PORT || 3000),
  fetch(request) {
    const url = new URL(request.url);
    return Response.json(responseBody({ name: url.searchParams.get('name') ?? undefined }));
  },
});

console.log(`small-app listening on ${server.url}`);
