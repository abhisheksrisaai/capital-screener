import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

const client = axios.create({
  baseURL: API_URL,
  timeout: 90000,
});

export function apiErrorMessage(err, fallback = 'Request failed') {
  const data = err?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data?.detail) {
    return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
  }
  if (err?.code === 'ECONNABORTED') return 'The request timed out. The API may be waking up — try again.';
  if (err?.message === 'Network Error') return 'Could not reach the API. Check the backend or retry after a cold start.';
  return err?.message || fallback;
}

export async function getHealth() {
  const { data } = await client.get('/api/health');
  return data;
}

export async function getCompanies(filters = {}) {
  const { data } = await client.get('/api/companies', { params: filters });
  return data;
}

export async function getSectors() {
  const { data } = await client.get('/api/companies/sectors');
  return data.sectors;
}

export async function getCompany(id) {
  const { data } = await client.get(`/api/companies/${id}`);
  return data;
}

export async function getFinancials(id) {
  const { data } = await client.get(`/api/companies/${id}/financials`);
  return data.financials;
}

export async function getRanking() {
  const { data } = await client.get('/api/ranking');
  return data.ranking;
}

export async function askQuestion(id, question) {
  const { data } = await client.post(`/api/companies/${id}/ask`, { question });
  return data;
}

export async function downloadMemo(id) {
  const response = await client.post(`/api/companies/${id}/memo`, {}, { responseType: 'blob' });
  const type = response.headers['content-type'] || '';
  if (type.includes('application/json')) {
    const text = await response.data.text();
    const parsed = JSON.parse(text);
    throw new Error(parsed.detail || 'Memo generation failed');
  }
  return response;
}
