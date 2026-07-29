async function main() {
  const url = 'https://api.github.com/repos/Bearson-norm/ico-management-system/actions/runs/28316274229';
  const res = await fetch(url, { headers: { 'User-Agent': 'node' } });
  const run = await res.json() as any;
  console.log(`Run ID: ${run.id}`);
  console.log(`Status: ${run.status}`);
  console.log(`Conclusion: ${run.conclusion}`);
  console.log(`Created At: ${run.created_at}`);
  console.log(`Updated At: ${run.updated_at}`);
  if (run.status === 'completed') {
    console.log("Completed!");
  } else {
    console.log("Still running...");
  }
}

main().catch(console.error);
