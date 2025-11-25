import { createTheme } from '@mui/material/styles';

// Design tokens aligned with design-tokens.css
const primaryAccent = '#6c8bff';
const secondaryAccent = '#4bd4aa';
const surfaceColor = 'rgb(15, 23, 42)';
const backgroundColor = '#0f1729';

export const glassFrontierTheme = createTheme({
  components: {
    MuiDataGrid: {
      styleOverrides: {
        root: {
          backgroundColor: 'transparent',
          border: 'none',
          fontSize: '0.875rem', // --text-sm
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: surfaceColor,
          borderRadius: '0.75rem', // --radius-md
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '999px', // --radius-full
          textTransform: 'none',
          fontSize: '0.875rem', // --text-sm
          fontWeight: 600,
          padding: '0.5rem 1rem', // --space-2 --space-4
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
      primary: '#f5f7ff',
      secondary: '#cbd5f5',
    },
  },
  shape: {
    borderRadius: 12, // --radius-md in pixels
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    fontSize: 16, // --text-base
    h1: {
      fontSize: '1.5rem', // --text-xl
      fontWeight: 600,
      letterSpacing: '0.02em',
    },
    h2: {
      fontSize: '1.25rem', // --text-lg
      fontWeight: 600,
    },
    body1: {
      fontSize: '1rem', // --text-base
    },
    body2: {
      fontSize: '0.875rem', // --text-sm
    },
    caption: {
      fontSize: '0.75rem', // --text-xs
    },
  },
});
