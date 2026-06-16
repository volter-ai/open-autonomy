export interface GreetingInput {
  name?: string;
}

export function greeting(input: GreetingInput = {}): string {
  const name = input.name?.trim() || 'world';
  return `hello, ${name}`;
}

export function responseBody(input: GreetingInput = {}): { message: string } {
  return { message: greeting(input) };
}
