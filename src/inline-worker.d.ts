/**
 * Module declaration pra imports `?inline` (esbuild plugin `inline-worker`).
 * Importação retorna o JS bundle do arquivo como string default, pronto pra Blob URL + Worker.
 */
declare module '*?inline' {
	const source: string;
	export default source;
}
