# C++ Start

Write a C++20 program in VS Code and print Bengali, Arabic, English, and Russian in the same output pane. C++ Start compiles the current editor text as UTF-8. The output pane includes a Bengali font for letters, vowel signs, and joined characters such as ক্ষ and জ্ঞ.

Created and designed by Associate Professor Mostafa Abotaleb, Yugra State University.

## Run your first program

1. Install C++ Start in desktop VS Code 1.83 or later. If you have the `.vsix` file, open the Command Palette, choose **Extensions: Install from VSIX...**, and select the file.
2. Open a trusted local folder. Create `hello.cpp`, or choose **C++ Start: New UTF-8 C++ File** from the Command Palette.
3. Paste the program below. Choose **Run C++ (UTF-8)** in the status bar or editor toolbar. The compiler arguments are supplied for you.

```cpp
#include <iostream>

int main() {
    std::cout << "আমি বাংলায় লিখি।\n"
              << "مرحبًا بالعالم!\n"
              << "Hello, world!\n"
              << "Привет, мир!\n";
}
```

Your first line of output should read `আমি বাংলায় লিখি।`. For programs that read from `std::cin`, type in the output pane's input box and choose **Send line**. Choose **End input** when the program should receive end-of-file.

## Compiler setup

| Platform | What to expect on first run |
| --- | --- |
| Windows 10 version 1809 or later, including Windows 11 Pro | Setup checks for the C++ Start compiler. If needed, it downloads the LLVM-MinGW package for your PC, checks its SHA-256 digest, and installs it for your Windows account. Allow about 190 MB for the download. |
| macOS on Apple silicon, including M4 and M5 | C++ Start uses Apple Clang and the macOS SDK. If the tools are missing, choose **Install** in Apple’s Command Line Tools dialog. C++ Start waits up to 20 minutes and resumes your run when the compiler and SDK are ready. If you cancel the wait or installation takes longer, run the file again after Apple finishes. |

To start setup separately, open the Command Palette and choose **C++ Start: Set Up C++ Compiler**. The extension includes its build runners. You can use it without the C++ Start desktop application.

## Find a compiler error

Run the file. If compilation fails, choose **Trace issue** in the output pane. Select a diagnostic when the compiler reports several. VS Code opens the local source file at the reported line and column, including a header in the project when Clang identifies it.

For a linker error or a program that exits with an error code, the compiler may provide no source location. Choose **Open issue log** to see the recorded details. Logs are stored on your computer. Run the file again after editing to refresh its diagnostics.

## Read and save Bengali text

The output pane follows VS Code’s light or dark theme and includes its own Bengali font. On your first trusted run or compiler setup, Windows registers the bundled font for your account. macOS uses an available Bengali font or installs the bundled face for your account. With VS Code’s default editor fonts, C++ Start adds a Bengali fallback for C++ files.

If the source editor still shows boxes, choose **Reload Window**. If you set your own **Editor: Font Family**, keep your coding font first and append a Bengali family if needed. Your custom font choices stay in place. The integrated terminal uses its own font setting.

If the source still shows the original letters, **C++ Start: Save C++ File as UTF-8 Copy** lets you preserve them in a new file. If the source itself already contains literal `????`, restore the words from an earlier copy or type them again before saving as UTF-8.

C++ Start builds the active source file and its included headers. For a project that links several separate `.cpp` files or uses CMake, use the project’s build configuration. C++ Start runs files in a local, trusted desktop workspace. The interface supports English, Arabic, Bengali, and Russian.
