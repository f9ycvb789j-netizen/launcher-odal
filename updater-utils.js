function isNewerVersion(remoteVersion, currentVersion) {
  const remote = String(remoteVersion).split('.').map((part) => parseInt(part, 10) || 0);
  const current = String(currentVersion).split('.').map((part) => parseInt(part, 10) || 0);
  const length = Math.max(remote.length, current.length);

  for (let i = 0; i < length; i++) {
    const remotePart = remote[i] || 0;
    const currentPart = current[i] || 0;
    if (remotePart > currentPart) return true;
    if (remotePart < currentPart) return false;
  }

  return false;
}

module.exports = { isNewerVersion };
