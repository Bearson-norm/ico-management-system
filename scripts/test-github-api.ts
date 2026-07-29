async function main() {
  const url = 'https://api.github.com/repos/Bearson-norm/ico-management-system/actions/runs?per_page=5';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'node' } });
    console.log("Status:", res.status);
    const data = await res.json() as any;
    if (data.message) {
      console.log("Message:", data.message);
    } else {
      console.log("Found runs:", data.workflow_runs?.length);
      if (data.workflow_runs && data.workflow_runs.length > 0) {
        console.log("Latest run:", {
          id: data.workflow_runs[0].id,
          name: data.workflow_runs[0].name,
          status: data.workflow_runs[0].status,
          conclusion: data.workflow_runs[0].conclusion,
          event: data.workflow_runs[0].event,
          html_url: data.workflow_runs[0].html_url
        });
      }
    }
  } catch (e: any) {
    console.error(e);
  }
}
main();
