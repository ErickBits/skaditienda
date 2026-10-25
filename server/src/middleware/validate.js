import { HttpError } from '../utils/http.js';

/**
 * Valida body/query/params con esquemas Zod y deja los datos ya limpios en `req.valid`.
 * Las rutas solo deben leer de `req.valid`, nunca directamente de `req.body`.
 *
 *   router.post('/', validate({ body: schema }), handler)
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(new HttpError(400, 'Datos inválidos', details));
    }
    req.valid[part] = result.data;
  }
  next();
};
