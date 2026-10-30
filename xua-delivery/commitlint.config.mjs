/**
 * Conventional Commits — a fonte de verdade do versionamento automático.
 * O semantic-release lê estes tipos para decidir major/minor/patch, então
 * mensagem fora do padrão significa release perdido ou errado.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 120],
    'body-max-line-length': [0],
    'subject-case': [0],
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'style', 'revert'],
    ],
  },
};
