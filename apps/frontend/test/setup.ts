import "@testing-library/jest-dom/vitest";

Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => undefined;
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.scrollIntoView = () => undefined;

Object.defineProperty(Blob.prototype, "arrayBuffer", {
  configurable: true,
  value: function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new TypeError("Blob could not be read as an ArrayBuffer."));
        }
      };
      reader.onerror = () => {
        reject(reader.error ?? new Error("Blob could not be read."));
      };
      reader.readAsArrayBuffer(this);
    });
  },
});
