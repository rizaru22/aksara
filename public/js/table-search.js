(() => {
    const hasDataTables = typeof window.DataTable === 'function';
    // Menghapus placeholder kosong pada tabel sebelum menambahkan pencarian agar UI tidak menampilkan baris dummy.
    const clearEmptyPlaceholder = (table) => {
        const rows = [...table.tBodies].flatMap((body) => [...body.rows]);
        if (rows.length !== 1 || ![...rows[0].cells].some((cell) => cell.hasAttribute('colspan'))) return;
        rows[0].remove();
    };

    // Menyiapkan pencarian manual pada tabel jika DataTables tidak tersedia atau tidak bisa diaktifkan.
    function enhanceWithFallback(table) {
        const parent = table.closest('.table-responsive') || table;
        const toolbar = document.createElement('div');
        toolbar.className = 'aksara-table-search-fallback mb-2';
        const label = document.createElement('label');
        const input = document.createElement('input');
        const id = `tableSearch${Math.random().toString(36).slice(2, 9)}`;
        label.htmlFor = id;
        label.textContent = 'Cari di tabel';
        input.id = id;
        input.type = 'search';
        input.className = 'form-control';
        input.placeholder = 'Ketik kata kunci';
        input.setAttribute('aria-label', 'Cari di tabel');
        const status = document.createElement('small');
        status.className = 'text-secondary';
        status.setAttribute('aria-live', 'polite');
        toolbar.append(label, input, status);
        parent.before(toolbar);

        const rows = [...table.tBodies].flatMap((body) => [...body.rows]);
        input.addEventListener('input', () => {
            const query = input.value.trim().toLocaleLowerCase('id');
            let visible = 0;
            rows.forEach((row) => {
                const matches = !query || row.textContent.toLocaleLowerCase('id').includes(query);
                row.hidden = !matches;
                if (matches) visible++;
            });
            status.textContent = query ? `${visible} baris ditemukan` : `${rows.length} baris`;
        });
        status.textContent = `${rows.length} baris`;
        table.dataset.aksaraSearchFallback = 'true';
    }

    // Menambahkan search/filter pada tabel dengan prioritas DataTables, lalu fallback manual bila perlu.
    function enhance(table) {
        if (!(table instanceof HTMLTableElement)) return;
        if (table.dataset.aksaraSearchFallback === 'true') return;
        if (hasDataTables && window.DataTable.isDataTable(table)) return;
        clearEmptyPlaceholder(table);

        if (!hasDataTables) {
            enhanceWithFallback(table);
            return;
        }

        const hasFormFields = Boolean(table.querySelector('input, select, textarea'));
        const serverPaged = table.dataset.datatablePaging === 'false';
        const lastHeader = table.tHead?.rows[0]?.cells?.[table.tHead.rows[0].cells.length - 1]?.textContent.trim().toLowerCase() || '';
        const actionColumn = /^(aksi|action|actions)$/.test(lastHeader) ? table.tHead.rows[0].cells.length - 1 : null;
        const layout = serverPaged
            ? { topStart: null, topEnd: 'search', bottomStart: null, bottomEnd: null }
            : { topStart: 'pageLength', topEnd: 'search', bottomStart: 'info', bottomEnd: 'paging' };

        new window.DataTable(table, {
            autoWidth: false,
            order: [],
            pageLength: 10,
            lengthMenu: [10, 25, 50, 100],
            paging: !hasFormFields && !serverPaged,
            pagingType: document.body.classList.contains('admin-mode') ? 'full_numbers' : 'simple_numbers',
            ordering: !hasFormFields,
            layout,
            columnDefs: actionColumn === null ? [] : [{ targets: actionColumn, orderable: false, searchable: false }],
            language: {
                search: 'Cari:',
                searchPlaceholder: 'Ketik kata kunci',
                lengthMenu: 'Tampilkan _MENU_ baris',
                info: 'Menampilkan _START_–_END_ dari _TOTAL_ baris',
                infoEmpty: 'Tidak ada data',
                zeroRecords: 'Tidak ditemukan data yang cocok',
                emptyTable: 'Tidak ada data untuk ditampilkan',
                paginate: { first: 'Awal', last: 'Akhir', next: 'Berikutnya', previous: 'Sebelumnya' },
            },
        });
    }

    // Menyisir struktur DOM untuk menemukan tabel baru yang belum diproses oleh enhancer.
    function scan(root) {
        if (root instanceof HTMLTableElement) enhance(root);
        root.querySelectorAll?.('table').forEach(enhance);
    }

    // Membersihkan instance DataTables lama saat node DOM dihapus untuk mencegah duplikasi atau memory leak.
    function cleanup(root) {
        if (!hasDataTables) return;
        const tables = [];
        if (root instanceof HTMLTableElement) tables.push(root);
        root.querySelectorAll?.('table').forEach((table) => tables.push(table));
        tables.forEach((table) => {
            if (window.DataTable.isDataTable(table)) new window.DataTable(table).destroy();
        });
    }

    const observer = new MutationObserver((changes) => {
        changes.forEach((change) => {
            change.removedNodes.forEach((node) => {
                if (node instanceof Element && !node.isConnected) cleanup(node);
            });
            change.addedNodes.forEach((node) => {
                if (node instanceof Element) scan(node);
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    scan(document.body);
})();
