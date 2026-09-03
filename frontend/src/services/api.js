import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

const client = axios.create({
  baseURL: API_URL,
  timeout: 60000,
});

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
  return response;
}
