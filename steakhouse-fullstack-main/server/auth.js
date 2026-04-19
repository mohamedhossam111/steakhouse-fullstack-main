// server/auth.js (ES module)
import jwt from 'jsonwebtoken';

/** Create a JWT with minimal RBAC payload */
export function signJwt(user) {
  const payload = {
    id: user.id,
    role: user.role,      // e.g., "Admin", "HQ", "Manager", "Cashier", "Customer"
    branch: user.branch || null
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });
}

/** Require a valid Bearer token and attach req.user */
export function authenticate(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, role, branch, iat, exp }
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

/** Normalize role to lowercase for consistent comparisons */
function normRole(r) {
  return String(r || '').trim().toLowerCase();
}

/** Allow only specific roles (case-insensitive) */
export function allowRoles(...roles) {
  const allowed = new Set(roles.map(normRole)); // e.g., allowRoles('Admin','HQ')
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (!allowed.has(normRole(req.user.role))) {
      return res.status(403).json({ error: 'forbidden: role' });
    }
    next();
  };
}

/**
 * Enforce same-branch access for branch-scoped resources.
 * getResourceBranch(req) must return the resource branch (string) or null/undefined if not found.
 * Admin/HQ can cross branches.
 */
const CROSS_BRANCH_ROLES = new Set(['admin', 'hq']); // add 'hq_manager' here if you use that exact label
export function requireSameBranch(getResourceBranch) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'unauthenticated' });

      const resourceBranch = await getResourceBranch(req);
      if (!resourceBranch) return res.status(404).json({ error: 'not found' });

      const userRole = normRole(req.user.role);
      if (CROSS_BRANCH_ROLES.has(userRole)) return next();

      if (req.user.branch !== resourceBranch) {
        return res.status(403).json({ error: 'forbidden: cross-branch' });
      }

      next();
    } catch (e) {
      console.error('requireSameBranch error:', e);
      res.status(500).json({ error: 'branch check failed' });
    }
  };
}
