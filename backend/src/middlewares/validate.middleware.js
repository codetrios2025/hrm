import { ApiError } from "../utils/ApiError.js";

export const validate =
  (schema, source = "body") =>
  (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const errorDetails = error.details.map((d) => d.message).join(", ");
      return next(new ApiError(400, `Validation Failed: ${errorDetails}`));
    }

    // req.query has only a getter in modern Express/Node, so override via defineProperty
    if (source === "query") {
      Object.defineProperty(req, "query", {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      req[source] = value;
    }

    next();
  };
