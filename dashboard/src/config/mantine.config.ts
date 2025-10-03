import { MantineThemeOverride } from '@mantine/core';

export const mantineTheme: MantineThemeOverride = {
  primaryColor: 'blue',
  primaryShade: 6,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontFamilyMonospace: 'Monaco, Courier, monospace',
  headings: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '2rem', lineHeight: '1.2' },
      h2: { fontSize: '1.5rem', lineHeight: '1.3' },
      h3: { fontSize: '1.25rem', lineHeight: '1.4' },
    },
  },
  colors: {
    // Enhanced color palette with better contrast
    brand: [
      '#f0f9ff', // 0
      '#e0f2fe', // 1
      '#bae6fd', // 2
      '#7dd3fc', // 3
      '#38bdf8', // 4
      '#0ea5e9', // 5
      '#0284c7', // 6
      '#0369a1', // 7
      '#075985', // 8
      '#0c4a6e', // 9
    ],
  },
  components: {
    Button: {
      defaultProps: {
        size: 'md',
        radius: 'md',
      },
      styles: (theme) => ({
        root: {
          fontWeight: 600,
          transition: 'all 0.2s ease',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: theme.shadows.md,
          },
          '&:active': {
            transform: 'translateY(0)',
          },
        },
      }),
    },
    Card: {
      defaultProps: {
        radius: 'lg',
        withBorder: true,
        shadow: 'sm',
      },
      styles: (theme) => ({
        root: {
          backgroundColor: theme.white,
          borderColor: theme.colors.gray[2],
          boxShadow: theme.shadows.sm,
        },
      }),
    },
    Modal: {
      defaultProps: {
        radius: 'lg',
        overlayProps: {
          backgroundOpacity: 0.6,
          blur: 4,
        },
        size: 'lg',
      },
    },
    Input: {
      defaultProps: {
        radius: 'md',
        size: 'md',
      },
      styles: (theme) => ({
        input: {
          borderColor: theme.colors.gray[3],
          '&:focus': {
            borderColor: theme.colors.blue[6],
            boxShadow: `0 0 0 1px ${theme.colors.blue[2]}`,
          },
        },
      }),
    },
    PasswordInput: {
      defaultProps: {
        radius: 'md',
        size: 'md',
      },
      styles: (theme) => ({
        input: {
          borderColor: theme.colors.gray[3],
          '&:focus': {
            borderColor: theme.colors.blue[6],
            boxShadow: `0 0 0 1px ${theme.colors.blue[2]}`,
          },
        },
      }),
    },
    Select: {
      defaultProps: {
        radius: 'md',
        size: 'md',
      },
    },
    Textarea: {
      defaultProps: {
        radius: 'md',
        size: 'md',
      },
    },
    Alert: {
      defaultProps: {
        radius: 'md',
      },
    },
    Title: {
      styles: (theme) => ({
        root: {
          color: theme.colors.gray[8],
        },
      }),
    },
    Text: {
      styles: (theme) => ({
        root: {
          color: theme.colors.gray[7],
        },
      }),
    },
  },
  spacing: {
    xs: '8px',
    sm: '12px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },
  radius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  shadows: {
    xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
};
