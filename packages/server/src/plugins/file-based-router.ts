import type { ParsedPath } from 'node:path'
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import path, { dirname, join, relative } from 'node:path'

type ModuleFile = {
  name: string
  path: string
  rel: string
}

/**
 * Recursively walk a directory and return all nested files.
 *
 * @param directory The directory path to walk recursively
 * @param tree The tree of directories leading to the current directory
 *
 * @returns An array of all nested files in the specified directory
 */
function walkTree(directory: string, tree: string[] = []) {
  const results: ModuleFile[] = []

  for (const fileName of readdirSync(directory)) {
    const filePath = join(directory, fileName)
    const fileStats = statSync(filePath)

    if (fileStats.isDirectory()) {
      results.push(...walkTree(filePath, [...tree, fileName]))
    }
    else {
      results.push({
        name: fileName,
        path: directory,
        rel: mergePaths(...tree, fileName),
      })
    }
  }

  return results
}

function mergePaths(...paths: string[]) {
  return `/${paths
    .map(path => path.replace(/^\/|\/$/g, ''))
    .filter(path => path !== '')
    .join('/')}`
}

export async function generateRouter(routesDir: string, outputFile: string) {
  const files = walkTree(
    routesDir,
  )

  const exports = await generateRoutes(files)
  const importPaths = exports.map(x => relative(dirname(outputFile), routesDir).concat(x.routePath))
  const router = buildRouter(exports.map((x) => {
    return {
      exports: Object.keys(x.exports),
      routePath: x.routePath,
    }
  }))
  let routerContent = `// This file is auto-generated\n\n`
  routerContent += importPaths.map((x, i) => `import { ${Object.keys(exports[i]!.exports).join(', ')} } from "./${x}"`).join('\n')
  routerContent += '\n\nexport const router = '
  // eslint-disable-next-line ban/ban
  routerContent += JSON.stringify(router, null, 2)
    .replace(/"/g, '')

  writeFileSync(join(outputFile), routerContent)
}

function buildRoutePath(parsedFile: ParsedPath) {
  const directory = parsedFile.dir === parsedFile.root ? '' : parsedFile.dir
  const name = parsedFile.name.startsWith('index')
    ? parsedFile.name.replace('index', '')
    : `/${parsedFile.name}`

  return directory + name
}

type BuildRouterInput = {
  routePath: string
  exports: string[]
}

type Router = Record<string, any>
function buildRouter(inputs: BuildRouterInput[]) {
  const router = {} as Router
  for (const input of inputs) {
    const segments = input.routePath.replace(/\{\w+\}/g, '').replace(/\/\//g, '/').split('/').filter(Boolean)

    let current = router
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!

      if (i === segments.length - 1) {
        current[segment] = current[segment] || {}
        for (const exp of input.exports) {
          current[segment][exp] = `${exp}.route({ path: '${input.routePath}' })`
        }
      }
      else {
        current[segment] = current[segment] || {}
        current = current[segment]
      }
    }
  }

  return simplifyRouter(router)
}

/**
 * Simplifies a nested router structure by flattening single-child branches.
 *
 * For example, if a router branch has only one child that is a string (route),
 * that child's value will be promoted to replace its parent node.
 * This helps create a more concise and cleaner router structure.
 *
 * @param router The router object to simplify
 * @returns A simplified version of the router with unnecessary nesting removed
 */
function simplifyRouter(router: Router) {
  const simplifiedRouter = {} as Router

  for (const key in router) {
    if (typeof router[key] === 'string') {
      simplifiedRouter[key] = router[key]
    }
    else if (typeof router[key] === 'object' && isSingleLeaf(router[key])) {
      const childKey = Object.keys(router[key])[0]!
      simplifiedRouter[key] = router[key][childKey]
    }
    else {
      simplifiedRouter[key] = simplifyRouter(router[key])
    }
  }

  return simplifiedRouter
}

function isSingleLeaf(obj: Router) {
  const keys = Object.keys(obj)
  return keys.length === 1 && typeof obj[keys[0]!] === 'string'
}

type Route = {
  exports: any
  routePath: string
}
const isCjs = () => typeof module !== 'undefined' && !!module?.exports

const IS_ESM = !isCjs()

const MODULE_IMPORT_PREFIX = IS_ESM ? 'file://' : ''

async function generateRoutes(files: ModuleFile[]) {
  const routes: Route[] = []

  for (const file of files) {
    const parsedFile = path.parse(file.rel)

    const routePath = buildRoutePath(parsedFile)
    const exports = await import(
      MODULE_IMPORT_PREFIX + path.join(file.path, file.name)
    )

    routes.push({
      exports,
      routePath,
    })
  }

  return routes
}
