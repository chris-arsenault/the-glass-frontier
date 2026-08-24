import type { LinkProps } from 'react-router-dom';
import { Link } from 'react-router-dom';

import { useUiStore } from '../../stores/uiStore';

type AtlasLinkProps = Omit<LinkProps, 'to'> & {
  slug: string;
};

export function AtlasLink({ onClick, slug, target, ...props }: AtlasLinkProps): React.JSX.Element {
  const openAtlasModal = useUiStore((state) => state.openAtlasModal);

  return (
    <Link
      {...props}
      target={target}
      to={`/atlas/${encodeURIComponent(slug)}`}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          target === '_blank'
        ) {
          return;
        }
        event.preventDefault();
        openAtlasModal(slug);
      }}
    />
  );
}
