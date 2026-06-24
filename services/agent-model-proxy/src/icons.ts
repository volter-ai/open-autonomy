// String-returning icon helper, kept for the (still string-templated) renderers. Backed by the TSX <Icon>
// component so there's one source of truth for the icon set as the UI migrates to TSX. New TSX components
// should use <Icon name="…"/> directly; this `icon()` is the bridge for the remaining string builders.
import { Icon, type IconName } from './ui/Icon.js';
import { render } from './ui/render.js';

export type { IconName };

export function icon(name: IconName, size = 14): string {
  return render(Icon({ name, size }));
}
