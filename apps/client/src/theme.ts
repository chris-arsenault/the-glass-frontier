import { createTheme } from '@mui/material/styles';
import type {} from '@mui/x-data-grid/themeAugmentation';

// Design tokens aligned with design-tokens.css
const primaryAccent = '#6c8bff';
const secondaryAccent = '#4bd4aa';
const surfaceColor = '#0c1322';
const backgroundColor = '#070b14';

export const glassFrontierTheme = createTheme({
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '0.375rem', // --radius-md
          fontSize: '0.8125rem', // --text-sm
          fontWeight: 600,
          padding: '0.35rem 0.85rem',
          textTransform: 'none',
        },
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          backgroundColor: 'transparent',
          border: 'none',
          fontSize: '0.8125rem', // --text-sm
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: surfaceColor,
          backgroundImage: 'none',
          borderRadius: '0.5rem', // --radius-lg
        },
      },
    },
  },
  palette: {
    background: {
      default: backgroundColor,
      paper: surfaceColor,
    },
    mode: 'dark',
    primary: {
      main: primaryAccent,
    },
    secondary: {
      main: secondaryAccent,
    },
    text: {
      primary: '#eef2fa',
      secondary: '#c4cfe4',
    },
  },
  shape: {
    borderRadius: 6, // --radius-md in pixels
  },
  typography: {
    body1: {
      fontSize: '0.9375rem', // --text-base
    },
    body2: {
      fontSize: '0.8125rem', // --text-sm
    },
    caption: {
      fontSize: '0.75rem', // --text-xs
    },
    fontFamily: '"Inter", system-ui, "Segoe UI", sans-serif',
    fontSize: 15,
    h1: {
      fontSize: '1.375rem', // --text-xl
      fontWeight: 600,
      letterSpacing: '0.01em',
    },
    h2: {
      fontSize: '1.125rem', // --text-lg
      fontWeight: 600,
    },
  },
});
