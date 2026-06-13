// ID ユーティリティ。パスパラメータの ID は DB に渡す前に形式チェックする
// （不正な uuid 文字列を pg に渡すと 22P02 で 500 になるため）。

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
