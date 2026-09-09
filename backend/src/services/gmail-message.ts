const encodeSubject = (subject: string) =>
  `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;

const wrapBase64 = (value: string) => value.match(/.{1,76}/g)?.join('\r\n') ?? '';

export const buildGmailRawMessage = (from: string, to: string, subject: string, html: string) => {
  // `to` is schema-validated and `from` comes from Google's userinfo response. Keep
  // header values single-line as a final guard against malformed MIME headers.
  const safeFrom = from.replace(/[\r\n]/g, '');
  const safeTo = to.replace(/[\r\n]/g, '');
  const encodedBody = wrapBase64(Buffer.from(html, 'utf8').toString('base64'));

  const mimeMessage = [
    `From: ${safeFrom}`,
    `To: ${safeTo}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodedBody,
  ].join('\r\n');

  return Buffer.from(mimeMessage, 'utf8').toString('base64url');
};
