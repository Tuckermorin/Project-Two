export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            const theme = localStorage.getItem('theme');
            if (theme === 'light') {
              document.body.classList.add('light-mode');
              document.documentElement.classList.remove('dark');
            } else {
              document.documentElement.classList.add('dark');
              document.body.classList.remove('light-mode');
            }
          })();
        `,
      }}
    />
  )
}
