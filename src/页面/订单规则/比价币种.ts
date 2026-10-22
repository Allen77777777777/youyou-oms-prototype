// 沿用订单规则金额条件现有的12种币种；正式字典复用中台资料。
export const 比价币种代码 = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'KRW', 'CAD', 'AUD', 'BRL', 'MXN', 'PLN', 'RUB'] as const
export const 比价币种选项 = [
  { value: 'CNY', label: '人民币（CNY）' }, { value: 'USD', label: '美元（USD）' },
  { value: 'EUR', label: '欧元（EUR）' }, { value: 'GBP', label: '英镑（GBP）' },
  { value: 'JPY', label: '日元（JPY）' }, { value: 'KRW', label: '韩元（KRW）' },
  { value: 'CAD', label: '加元（CAD）' }, { value: 'AUD', label: '澳元（AUD）' },
  { value: 'BRL', label: '巴西雷亚尔（BRL）' }, { value: 'MXN', label: '墨西哥比索（MXN）' },
  { value: 'PLN', label: '波兰兹罗提（PLN）' }, { value: 'RUB', label: '俄罗斯卢布（RUB）' },
]
export function 是否支持比价币种(value: unknown): value is typeof 比价币种代码[number] {
  return typeof value === 'string' && 比价币种代码.some(code => code === value)
}
