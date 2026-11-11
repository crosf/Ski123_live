const TimingApi = {
    async getEventInfo() {
        const response = await fetch('/api/event');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },

    async getResults(raceId, rankingNr) {
        const response = await fetch(`/api/results?raceId=${raceId}&rankingNr=${rankingNr}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }
};