window.createAksaraAcademicYears = function ({ openMaster }) {
    return {
        // Membuka panel master tahun ajaran dari modul akademik yang lebih umum.
        open() {
            return openMaster('academic-years');
        },
    };
};
