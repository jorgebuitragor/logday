// JsBarcode no trae tipos para sus codificadores sueltos; DevTools solo
// usa estos (tools/codes.ts), sin el renderizador que necesita DOM.
declare module 'jsbarcode/bin/barcodes' {
  const barcodes: Record<string, unknown>;
  export default barcodes;
}
