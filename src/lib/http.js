export async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error('Could not connect to the server.');
  }
  const body = await response.text();
  let result = {};
  try {
    result = body ? JSON.parse(body) : {};
  } catch {
    result = {};
  }
  if (!response.ok) throw new Error(result.error || 'Something went wrong.');
  return result;
}
