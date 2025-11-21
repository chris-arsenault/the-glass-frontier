import type { LocationEdge } from './Edge';
import type { LocationPlace } from './Place';

export type LocationNeighbors = {
  parent: LocationPlace | null;
  children: LocationPlace[];
  siblings: LocationPlace[];
  adjacent: Array<{ edge: LocationEdge; neighbor: LocationPlace; direction: 'out' | 'in' }>;
  links: Array<{ edge: LocationEdge; neighbor: LocationPlace; direction: 'out' | 'in' }>;
};
