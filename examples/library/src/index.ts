export interface SlugOptions {
  maxLength?: number;
}

export function slugify(value: string, options: SlugOptions = {}): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return options.maxLength ? slug.slice(0, options.maxLength).replace(/-+$/g, '') : slug;
}
