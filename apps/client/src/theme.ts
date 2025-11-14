import { createTheme } from '@mui/material/styles';

const primaryAccent = '#6c8bff';
const surface = '#1a2234';
const background = '#0f1729';

export const glassFrontierTheme = createTheme({
  components: {
    MuiDataGrid: {
      styleOverrides: {
        root: {
          backgroundColor: 'transparent',
          border: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
  palette: {
    background: {
      default: background,
      paper: surface,
    },
    mode: 'dark',
    primary: {
      main: primaryAccent,
    },
    secondary: {
      main: '#4bd4aa',
    },
    text: {
      primary: '#f5f7ff',
      secondary: 'rgba(245, 247, 255, 0.75)',
    },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
});
