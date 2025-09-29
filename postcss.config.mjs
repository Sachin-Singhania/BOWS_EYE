/** @type {import('postcss-load-config').Config} */
const config = {
   plugins: [
    function ({ addUtilities }) {
      addUtilities({
        ".scrollbar-hide": {
          "&::-webkit-scrollbar": {
            display: "none",
          },
          "-ms-overflow-style": "none",
          "scrollbar-width": "none",
        },
      })
    },
  ],
}

export default config
