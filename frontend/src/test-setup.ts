import '@testing-library/jest-dom';

// jsdom does not implement Element.scrollTo — the App uses it for
// auto-scrolling the chat container. Add a no-op so useEffect doesn't throw.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// jsdom also lacks HTMLDivElement.prototype.scrollTo in some versions.
// The mock above on Element.prototype covers all element subtypes.
