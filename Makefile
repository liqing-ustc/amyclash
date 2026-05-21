OPENCLI_HOME ?= $(HOME)/.opencli
LOCAL_BIN    ?= $(HOME)/.local/bin

.PHONY: help install-adapter link sync install

help:
	@echo "make install-adapter  # copy adapter/ into ~/.opencli/{clis,sites}/amytele"
	@echo "make sync             # uv sync the amy-patch CLI in patch/"
	@echo "make link             # symlink bin/amyclash into ~/.local/bin"
	@echo "make install          # all of the above"

# opencli discovers adapters by scanning real dirs under ~/.opencli/sites — never
# symlink them (a symlinked adapter silently disappears from opencli --help).
install-adapter:
	mkdir -p $(OPENCLI_HOME)/clis $(OPENCLI_HOME)/sites
	rm -rf $(OPENCLI_HOME)/clis/amytele $(OPENCLI_HOME)/sites/amytele
	cp -R adapter/clis  $(OPENCLI_HOME)/clis/amytele
	cp -R adapter/sites $(OPENCLI_HOME)/sites/amytele
	@echo "installed; verify with: opencli amytele --help"

sync:
	cd patch && uv sync

link:
	mkdir -p $(LOCAL_BIN)
	ln -sf $(CURDIR)/bin/amyclash $(LOCAL_BIN)/amyclash
	@echo "linked $(LOCAL_BIN)/amyclash -> $(CURDIR)/bin/amyclash"

install: install-adapter sync link
