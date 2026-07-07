import { NextRequest, NextResponse } from 'next/server';
import { requireGaEditor } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = 'https://api.github.com/repos/Bearson-norm/ico-management-system/actions/runs?per_page=10';
  const headers: Record<string, string> = { 'User-Agent': 'node' };
  
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  try {
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ success: false, error: `GitHub API error: ${res.statusText}` }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json({ success: true, data: data.workflow_runs || [], canTrigger: !!token });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  if (!token) {
    return NextResponse.json({ success: false, error: 'GITHUB_TOKEN is not configured in .env' }, { status: 400 });
  }

  const url = 'https://api.github.com/repos/Bearson-norm/ico-management-system/actions/workflows/deploy-vps.yml/dispatches';
  const headers = {
    'User-Agent': 'node',
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ref: 'main' })
    });
    if (res.status === 204) {
      return NextResponse.json({ success: true, message: 'Deployment triggered successfully!' });
    } else {
      const errText = await res.text();
      return NextResponse.json({ success: false, error: `GitHub API error: ${res.status} ${errText}` }, { status: res.status });
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
