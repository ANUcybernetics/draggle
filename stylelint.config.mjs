// oxfmt owns formatting, so the standard rules that contest it are off.
export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["dist/**", ".astro/**", "node_modules/**"],
  rules: {
    "no-descending-specificity": null,
    "comment-empty-line-before": null,
    "custom-property-empty-line-before": null,
    "value-keyword-case": null,
    "import-notation": null,
    "selector-class-pattern": null,
  },
};
