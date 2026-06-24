const displayNameForFile = (filename: string) => {
    const trimmed = filename.trim();
    if (!trimmed) {
        return 'model';
    }

    const withoutQuery = trimmed.split(/[?#]/)[0].replace(/\\/g, '/');
    const name = withoutQuery.split('/').filter(Boolean).pop() || trimmed;

    try {
        return decodeURIComponent(name);
    } catch {
        return name;
    }
};

export { displayNameForFile };
