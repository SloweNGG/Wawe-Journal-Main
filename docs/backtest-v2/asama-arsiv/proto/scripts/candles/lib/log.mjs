// Logger: plain lines locally, GitHub annotations (::error::/::warning::/::notice::) under Actions.
// Every message passes through redact(): registered secrets never reach stdout/stderr or the report.
export function createLogger({ gha = process.env.GITHUB_ACTIONS === 'true', out = process.stdout, err = process.stderr, verbose = false } = {}) {
  const secrets = [];
  const redact = (s) => {
    let t = String(s);
    for (const x of secrets) if (x) t = t.split(x).join('***');
    return t.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '***jwt***')
            .replace(/sb_secret_[A-Za-z0-9_-]+/g, '***secret***');
  };
  // GitHub workflow commands: escape % \r \n in data, plus : and , in properties.
  const esc = (s) => redact(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const escProp = (s) => esc(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
  const annotate = (kind, msg, title) => gha
    ? `::${kind}${title ? ` title=${escProp(title)}` : ''}::${esc(msg)}`
    : `${kind.toUpperCase()}: ${redact(msg)}`;
  return {
    addSecret(s) { if (s && s.length >= 8) secrets.push(s); },
    redact,
    info(msg) { out.write(redact(msg) + '\n'); },
    debug(msg) { if (verbose) out.write(redact(msg) + '\n'); },
    notice(msg, title) { out.write(annotate('notice', msg, title) + '\n'); },
    warn(msg, title) { err.write(annotate('warning', msg, title) + '\n'); },
    error(msg, title) { err.write(annotate('error', msg, title) + '\n'); },
    group(name) { out.write(gha ? `::group::${esc(name)}\n` : `--- ${redact(name)}\n`); },
    endGroup() { if (gha) out.write('::endgroup::\n'); }
  };
}
