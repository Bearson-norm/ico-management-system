async function main() {
  const url = 'https://msic.moof-set.web.id/api/auth/session';
  console.log("Fetching VPS session status from:", url);
  const res = await fetch(url);
  const text = await res.text();
  console.log("Response status:", res.status);
  console.log("Response headers:", [...res.headers.entries()]);
  console.log("Response text:", text);
}

main().catch(console.error);
