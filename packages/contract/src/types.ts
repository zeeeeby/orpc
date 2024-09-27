import { input, output, ZodType } from 'zod'

export type HTTPPath = `/${string}`
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
export type HTTPStatus = number

export type StandardizeHTTPPath<T extends HTTPPath> = T extends ''
  ? '/'
  : T extends '/'
  ? '/'
  : T extends `/${infer P1}//${infer P2}`
  ? StandardizeHTTPPath<`/${P1}/${P2}`>
  : T extends `//${infer P}`
  ? StandardizeHTTPPath<`/${P}`>
  : T extends `/${infer P}//`
  ? StandardizeHTTPPath<`/${P}`>
  : T extends `/${infer P}/`
  ? StandardizeHTTPPath<`/${P}`>
  : T

export type PrefixHTTPPath<
  TPrefix extends HTTPPath,
  TPath extends HTTPPath
> = StandardizeHTTPPath<TPrefix> extends '/'
  ? StandardizeHTTPPath<TPath>
  : StandardizeHTTPPath<TPath> extends '/'
  ? StandardizeHTTPPath<TPrefix>
  : StandardizeHTTPPath<TPrefix> extends `/${infer UPrefix}`
  ? `/${UPrefix}${StandardizeHTTPPath<TPath>}`
  : never

export type Schema = ZodType<any, any, any>
export type SchemaInput<T extends Schema> = input<T>
export type SchemaOutput<T extends Schema> = output<T>
