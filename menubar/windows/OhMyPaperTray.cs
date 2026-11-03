// oh-my-paper tray companion for Windows: the counterpart of menubar/main.swift.
// Shows whether the local web server (127.0.0.1:8788) is running, starts it with node and tsx
// when it is not, and opens the reader in the browser. The user's Run key starts it at sign-in,
// so neither it nor the server is a child of a console that may close: `oh-my-paper menubar`
// builds it with the C# compiler of the .NET Framework that every Windows 10 and 11 carries, and
// starts it.
//
// That compiler speaks C# 5: no string interpolation, no ?. operator, no expression bodies.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace OhMyPaper
{
  internal sealed class Options
  {
    public string Repo = "";
    public string Port = "8788";
    public string Node = "";
    public bool WriteLoginItem;
    public bool Quit;

    public string Origin
    {
      get { return "http://127.0.0.1:" + Port; }
    }
  }

  internal enum ServerState { Running, Starting, Stopped, PortUnavailable }

  internal static class Program
  {
    internal const double HealthInterval = 5;
    internal const double StartingBudget = 30;
    internal const double RespawnBackoff = 60;
    internal const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    // Where Task Manager and Settings record that a startup app was turned off.
    internal const string ApprovedKey = @"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    internal const string RunValue = "oh-my-paper";
    internal const string MutexName = @"Local\oh-my-paper-tray";
    internal const string QuitEventName = @"Local\oh-my-paper-tray-quit";
    // src/server/portUnavailable.ts: the server could not have its port, so restarting is futile.
    internal const int PortUnavailableExitCode = 78;
    private const long LogLimit = 5 * 1024 * 1024;

    internal static readonly string DataFolder = Path.Combine(
      Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "oh-my-paper");
    internal static readonly string LogPath = Path.Combine(DataFolder, "Logs", "tray.log");
    // PATH and the OH_MY_PAPER_* settings of the console that installed the companion, the way
    // the macOS agent carries them: Windows starts Run-key programs with only the stored ones.
    internal static readonly string EnvironmentPath = Path.Combine(DataFolder, "tray.env");

    private static readonly object LogLock = new object();
    private static readonly Encoding Utf8 = new UTF8Encoding(false);
    private static bool? korean;

    /// <summary>
    /// The language the terminal and the app speak: OH_MY_PAPER_LANG, then the one picked with
    /// `oh-my-paper language` (language.json in the data folder), then Windows' own.
    /// </summary>
    internal static bool Korean
    {
      get
      {
        if (korean.HasValue) return korean.Value;
        string chosen = Environment.GetEnvironmentVariable("OH_MY_PAPER_LANG") ?? "";
        if (chosen.StartsWith("ko", StringComparison.OrdinalIgnoreCase)) korean = true;
        else if (chosen.StartsWith("en", StringComparison.OrdinalIgnoreCase)) korean = false;
        else
        {
          string saved = SavedLanguage();
          korean = saved != null
            ? saved == "ko"
            : CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "ko";
        }
        return korean.Value;
      }
    }

    private static string SavedLanguage()
    {
      try
      {
        string dataDir = Environment.GetEnvironmentVariable("OH_MY_PAPER_WEB_DATA_DIR");
        if (string.IsNullOrEmpty(dataDir))
          dataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".ohmypaper", "web");
        string file = Path.Combine(dataDir, "language.json");
        if (!File.Exists(file)) return null;
        Match match = Regex.Match(File.ReadAllText(file, Utf8), "\"language\"\\s*:\\s*\"(ko|en)\"");
        return match.Success ? match.Groups[1].Value : null;
      }
      catch (Exception)
      {
        return null;
      }
    }

    internal static string Text(string ko, string en)
    {
      return Korean ? ko : en;
    }

    internal static void Log(string line)
    {
      lock (LogLock)
      {
        try
        {
          Directory.CreateDirectory(Path.GetDirectoryName(LogPath));
          File.AppendAllText(LogPath, line + Environment.NewLine, Utf8);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
      }
    }

    /// <summary>Starts the log afresh past a few megabytes, keeping the previous one beside it.</summary>
    private static void RotateLog()
    {
      try
      {
        FileInfo log = new FileInfo(LogPath);
        if (!log.Exists || log.Length < LogLimit) return;
        string previous = LogPath + ".1";
        if (File.Exists(previous)) File.Delete(previous);
        File.Move(LogPath, previous);
      }
      catch (IOException)
      {
      }
      catch (UnauthorizedAccessException)
      {
      }
    }

    /// <summary>One argument quoted the way Windows programs split their command line.</summary>
    internal static string Quote(string value)
    {
      if (value.Length > 0 && value.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return value;
      StringBuilder builder = new StringBuilder("\"");
      int backslashes = 0;
      foreach (char c in value)
      {
        if (c == '\\')
        {
          backslashes += 1;
          continue;
        }
        if (c == '"')
        {
          builder.Append('\\', backslashes * 2 + 1);
        }
        else
        {
          builder.Append('\\', backslashes);
        }
        builder.Append(c);
        backslashes = 0;
      }
      builder.Append('\\', backslashes * 2);
      builder.Append('"');
      return builder.ToString();
    }

    private static Options Parse(string[] args)
    {
      Options options = new Options();
      for (int i = 0; i < args.Length; i += 1)
      {
        string next = i + 1 < args.Length ? args[i + 1] : null;
        switch (args[i])
        {
          case "--repo":
            if (next != null) options.Repo = next;
            i += 1;
            break;
          case "--port":
            if (next != null) options.Port = next;
            i += 1;
            break;
          case "--node":
            if (next != null) options.Node = next;
            i += 1;
            break;
          case "--write-login-item":
            options.WriteLoginItem = true;
            break;
          case "--quit":
            options.Quit = true;
            break;
        }
      }
      if (options.Repo.Length == 0) options.Repo = Environment.CurrentDirectory;
      options.Repo = Path.GetFullPath(options.Repo).TrimEnd('\\');
      return options;
    }

    internal static string ExecutablePath()
    {
      return Path.GetFullPath(Assembly.GetExecutingAssembly().Location);
    }

    /// <summary>
    /// Starts the companion at sign-in from the user's Run key (no administrator rights needed),
    /// with the settings of the console that ran it kept beside it for that start.
    /// </summary>
    internal static void WriteLoginItem(Options options)
    {
      StringBuilder command = new StringBuilder();
      command.Append(Quote(ExecutablePath()));
      command.Append(" --repo ").Append(Quote(options.Repo));
      command.Append(" --port ").Append(Quote(options.Port));
      if (options.Node.Length > 0) command.Append(" --node ").Append(Quote(options.Node));
      using (RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKey))
      {
        key.SetValue(RunValue, command.ToString(), RegistryValueKind.String);
      }
      // Turning it on here also undoes a "Disabled" set in Task Manager.
      using (RegistryKey approved = Registry.CurrentUser.OpenSubKey(ApprovedKey, true))
      {
        if (approved != null) approved.DeleteValue(RunValue, false);
      }
      StringBuilder saved = new StringBuilder();
      foreach (System.Collections.DictionaryEntry entry in Environment.GetEnvironmentVariables())
      {
        string name = (string)entry.Key;
        if (name.Equals("PATH", StringComparison.OrdinalIgnoreCase) ||
            name.StartsWith("OH_MY_PAPER_", StringComparison.OrdinalIgnoreCase))
        {
          saved.Append(name).Append('=').Append((string)entry.Value).Append('\n');
        }
      }
      Directory.CreateDirectory(DataFolder);
      File.WriteAllText(EnvironmentPath, saved.ToString(), Utf8);
    }

    internal static void RemoveLoginItem()
    {
      using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKey, true))
      {
        if (key != null) key.DeleteValue(RunValue, false);
      }
      using (RegistryKey approved = Registry.CurrentUser.OpenSubKey(ApprovedKey, true))
      {
        if (approved != null) approved.DeleteValue(RunValue, false);
      }
    }

    /// <summary>Whether Windows starts the companion at sign-in: listed, and not turned off.</summary>
    internal static bool LoginItemEnabled()
    {
      using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKey, false))
      {
        if (key == null || key.GetValue(RunValue) == null) return false;
      }
      using (RegistryKey approved = Registry.CurrentUser.OpenSubKey(ApprovedKey, false))
      {
        byte[] state = approved == null ? null : approved.GetValue(RunValue) as byte[];
        // An odd first byte (03, 07) is "Disabled"; 02 and 06 are "Enabled".
        return state == null || state.Length == 0 || (state[0] & 1) == 0;
      }
    }

    /// <summary>
    /// Takes on the saved settings: their PATH entries go first, the ones Windows gave this
    /// start follow, so programs installed since are found as well.
    /// </summary>
    private static void LoadSavedEnvironment()
    {
      if (!File.Exists(EnvironmentPath)) return;
      foreach (string line in File.ReadAllLines(EnvironmentPath, Utf8))
      {
        int split = line.IndexOf('=');
        if (split <= 0) continue;
        string name = line.Substring(0, split);
        string value = line.Substring(split + 1);
        if (name.Equals("PATH", StringComparison.OrdinalIgnoreCase))
        {
          List<string> entries = new List<string>(value.Split(';'));
          foreach (string entry in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
          {
            if (entry.Length > 0 && !entries.Exists(e => e.Equals(entry, StringComparison.OrdinalIgnoreCase)))
              entries.Add(entry);
          }
          Environment.SetEnvironmentVariable("PATH", string.Join(";", entries.ToArray()));
        }
        else
        {
          Environment.SetEnvironmentVariable(name, value);
        }
      }
    }

    /// <summary>
    /// `--quit`: asks a running companion to stop its server and leave, and waits until it has.
    /// 0 when none runs any more, 1 when it is still there after the wait.
    /// </summary>
    private static int QuitRunning()
    {
      EventWaitHandle quit;
      if (!EventWaitHandle.TryOpenExisting(QuitEventName, out quit)) return 0;
      using (quit)
      {
        quit.Set();
      }
      using (Mutex running = new Mutex(false, MutexName))
      {
        try
        {
          if (!running.WaitOne(20000)) return 1;
          running.ReleaseMutex();
        }
        catch (AbandonedMutexException)
        {
          // It ended without letting go of the mutex, which is gone now either way.
        }
      }
      return 0;
    }

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [STAThread]
    private static int Main(string[] args)
    {
      Options options = Parse(args);
      if (options.Quit) return QuitRunning();
      if (options.WriteLoginItem)
      {
        try
        {
          WriteLoginItem(options);
          Console.WriteLine(RunValue);
          return 0;
        }
        catch (Exception error)
        {
          Console.Error.WriteLine(error.Message);
          return 1;
        }
      }

      bool created;
      using (Mutex single = new Mutex(true, MutexName, out created))
      {
        // One companion per signed-in user. A companion that is just leaving (re-run by
        // `oh-my-paper menubar`) gets a moment to let go; a second start otherwise leaves.
        if (!created)
        {
          try
          {
            if (!single.WaitOne(5000)) return 0;
          }
          catch (AbandonedMutexException)
          {
            // The previous companion ended without letting go; the mutex is this one's now.
          }
        }
        RotateLog();
        try
        {
          LoadSavedEnvironment();
        }
        catch (Exception error)
        {
          Log("[tray] could not read " + EnvironmentPath + ": " + error.Message);
        }
        try
        {
          SetProcessDPIAware();
        }
        catch (EntryPointNotFoundException)
        {
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.ThreadException += (sender, e) => Log("[tray] " + e.Exception);
        AppDomain.CurrentDomain.UnhandledException +=
          (sender, e) => Log("[tray] " + e.ExceptionObject);
        Log("[tray] " + DateTime.Now.ToString("s") + " started for " + options.Repo);
        using (EventWaitHandle quit = new EventWaitHandle(false, EventResetMode.AutoReset, QuitEventName))
        {
          Application.Run(new TrayContext(options, quit));
        }
        single.ReleaseMutex();
      }
      return 0;
    }
  }

  /// <summary>
  /// A job that ends every process in it when the companion ends, however it ends, so a server
  /// it started never outlives it (the macOS agent takes its server down the same way).
  /// </summary>
  internal static class KillOnCloseJob
  {
    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimitInformation
    {
      public long PerProcessUserTimeLimit;
      public long PerJobUserTimeLimit;
      public uint LimitFlags;
      public UIntPtr MinimumWorkingSetSize;
      public UIntPtr MaximumWorkingSetSize;
      public uint ActiveProcessLimit;
      public UIntPtr Affinity;
      public uint PriorityClass;
      public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters
    {
      public ulong ReadOperationCount;
      public ulong WriteOperationCount;
      public ulong OtherOperationCount;
      public ulong ReadTransferCount;
      public ulong WriteTransferCount;
      public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimitInformation
    {
      public BasicLimitInformation BasicLimitInformation;
      public IoCounters IoInfo;
      public UIntPtr ProcessMemoryLimit;
      public UIntPtr JobMemoryLimit;
      public UIntPtr PeakProcessMemoryUsed;
      public UIntPtr PeakJobMemoryUsed;
    }

    private const int JobObjectExtendedLimitInformation = 9;
    private const uint KillOnJobClose = 0x2000;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
      IntPtr job, int informationClass, ref ExtendedLimitInformation information, uint length);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    // Held open for the companion's lifetime; Windows closes it, and so ends the job, on exit.
    private static IntPtr job = IntPtr.Zero;

    internal static void Add(Process process)
    {
      try
      {
        if (job == IntPtr.Zero)
        {
          IntPtr created = CreateJobObject(IntPtr.Zero, null);
          if (created == IntPtr.Zero) return;
          ExtendedLimitInformation limits = new ExtendedLimitInformation();
          limits.BasicLimitInformation.LimitFlags = KillOnJobClose;
          uint length = (uint)Marshal.SizeOf(typeof(ExtendedLimitInformation));
          if (!SetInformationJobObject(created, JobObjectExtendedLimitInformation, ref limits, length))
          {
            Program.Log("[tray] no job for the server (" + Marshal.GetLastWin32Error() + ")");
            return;
          }
          job = created;
        }
        if (!AssignProcessToJobObject(job, process.Handle))
          Program.Log("[tray] could not put the server in its job (" + Marshal.GetLastWin32Error() + ")");
      }
      catch (Exception error)
      {
        Program.Log("[tray] no job for the server: " + error.Message);
      }
    }
  }

  internal sealed class TrayContext : ApplicationContext
  {
    private readonly Options options;
    private readonly NotifyIcon icon = new NotifyIcon();
    private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    private readonly ToolStripMenuItem statusItem = new ToolStripMenuItem();
    private readonly ToolStripMenuItem openItem = new ToolStripMenuItem();
    private readonly ToolStripMenuItem loginItem = new ToolStripMenuItem();
    private readonly ToolStripMenuItem quitItem = new ToolStripMenuItem();
    private readonly SynchronizationContext ui;
    private readonly RegisteredWaitHandle quitWait;
    private Icon runningIcon;
    private Icon idleIcon;
    private Process child;
    private ServerState state = ServerState.Stopped;
    private DateTime startingSince = DateTime.MinValue;
    private DateTime lastSpawnAt = DateTime.MinValue;
    private bool ticking;
    private bool quitting;
    private bool healthMissing;

    public TrayContext(Options options, EventWaitHandle quit)
    {
      this.options = options;
      WindowsFormsSynchronizationContext context = new WindowsFormsSynchronizationContext();
      SynchronizationContext.SetSynchronizationContext(context);
      ui = context;
      LoadIcons();

      statusItem.Enabled = false;
      openItem.Text = Program.Text("리더 열기", "Open reader");
      openItem.Click += (sender, e) => OpenReader();
      loginItem.Text = Program.Text("로그인 시 자동 실행", "Start at sign-in");
      loginItem.Click += (sender, e) => ToggleLogin();
      quitItem.Text = Program.Text("종료", "Quit");
      quitItem.Click += (sender, e) => Quit();
      ContextMenuStrip menu = new ContextMenuStrip();
      menu.Items.Add(statusItem);
      menu.Items.Add(openItem);
      menu.Items.Add(new ToolStripSeparator());
      menu.Items.Add(loginItem);
      menu.Items.Add(new ToolStripSeparator());
      menu.Items.Add(quitItem);

      icon.ContextMenuStrip = menu;
      icon.Icon = idleIcon;
      icon.DoubleClick += (sender, e) => OpenReader();
      // A left click opens the menu too, as the menu bar item does on macOS.
      icon.MouseUp += (sender, e) =>
      {
        if (e.Button != MouseButtons.Left) return;
        MethodInfo show = typeof(NotifyIcon).GetMethod(
          "ShowContextMenu", BindingFlags.Instance | BindingFlags.NonPublic);
        if (show != null) show.Invoke(icon, null);
      };
      icon.Visible = true;

      // `oh-my-paper menubar off`, or a re-run of `menubar`, asks through this event.
      quitWait = ThreadPool.RegisterWaitForSingleObject(
        quit, (unused, timedOut) => ui.Post(_ => Quit(), null), null, -1, true);
      // Signing out or shutting down: the server gets its few seconds to close the library.
      SystemEvents.SessionEnding += (sender, e) => StopServer(4000);
      // The taskbar turned light or dark: the leaf follows, so it stays visible.
      SystemEvents.UserPreferenceChanged += (sender, e) =>
      {
        if (e.Category != UserPreferenceCategory.General) return;
        LoadIcons();
        Refresh();
      };
      Application.ApplicationExit += (sender, e) => StopServer(8000);
      timer.Interval = (int)(Program.HealthInterval * 1000);
      timer.Tick += (sender, e) => Tick();
      timer.Start();
      Refresh();
      Tick();
    }

    private static bool DarkTaskbar()
    {
      try
      {
        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(
          @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", false))
        {
          object light = key == null ? null : key.GetValue("SystemUsesLightTheme");
          // Windows 10 before 1903 has no light taskbar: it is dark unless it says otherwise.
          return !(light is int) || (int)light == 0;
        }
      }
      catch (Exception)
      {
        return true;
      }
    }

    private void LoadIcons()
    {
      bool dark = DarkTaskbar();
      runningIcon = LeafIcon(1f, dark);
      // The leaf dims while the server is not answering.
      idleIcon = LeafIcon(0.45f, dark);
    }

    /// <summary>The visible part of the mark, without the transparent margin around the leaf.</summary>
    private static Rectangle VisibleBounds(Bitmap image)
    {
      Rectangle all = new Rectangle(0, 0, image.Width, image.Height);
      BitmapData data = image.LockBits(all, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      try
      {
        byte[] pixels = new byte[data.Stride * data.Height];
        Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
        int left = image.Width, top = image.Height, right = -1, bottom = -1;
        for (int y = 0; y < image.Height; y += 1)
        {
          for (int x = 0; x < image.Width; x += 1)
          {
            if (pixels[y * data.Stride + x * 4 + 3] < 32) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
        }
        if (right < left || bottom < top) return all;
        // Square, so the leaf keeps its shape in the square icon.
        int side = Math.Max(right - left + 1, bottom - top + 1);
        int x0 = Math.Max(0, Math.Min(image.Width - side, (left + right + 1 - side) / 2));
        int y0 = Math.Max(0, Math.Min(image.Height - side, (top + bottom + 1 - side) / 2));
        return new Rectangle(x0, y0, Math.Min(side, image.Width), Math.Min(side, image.Height));
      }
      finally
      {
        image.UnlockBits(data);
      }
    }

    /// <summary>
    /// The leaf at the notification area's icon size. On a dark taskbar its dark green turns the
    /// light leaf green of the terminal wizard, and the gold veins stay as they are.
    /// </summary>
    private Icon LeafIcon(float opacity, bool dark)
    {
      Size size = SystemInformation.SmallIconSize;
      Bitmap canvas = new Bitmap(size.Width, size.Height, PixelFormat.Format32bppArgb);
      string mark = Path.Combine(options.Repo, "assets", "branding", "ohmypaper-leaf-mark.png");
      try
      {
        using (Bitmap leaf = new Bitmap(mark))
        using (Graphics graphics = Graphics.FromImage(canvas))
        using (ImageAttributes attributes = new ImageAttributes())
        {
          ColorMatrix matrix = new ColorMatrix();
          matrix.Matrix33 = opacity;
          attributes.SetColorMatrix(matrix);
          Rectangle visible = VisibleBounds(leaf);
          graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
          graphics.DrawImage(leaf, new Rectangle(0, 0, size.Width, size.Height),
            visible.X, visible.Y, visible.Width, visible.Height, GraphicsUnit.Pixel, attributes);
        }
        if (dark)
        {
          for (int y = 0; y < canvas.Height; y += 1)
          {
            for (int x = 0; x < canvas.Width; x += 1)
            {
              Color pixel = canvas.GetPixel(x, y);
              if (pixel.A == 0 || pixel.GetBrightness() > 0.35f) continue;
              canvas.SetPixel(x, y, Color.FromArgb(pixel.A, 127, 209, 160));
            }
          }
        }
        return Icon.FromHandle(canvas.GetHicon());
      }
      catch (Exception error)
      {
        Program.Log("[tray] no leaf icon (" + error.Message + ")");
        return SystemIcons.Application;
      }
    }

    private static async Task<int> Status(string url)
    {
      try
      {
        HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
        request.Proxy = null;
        Task<WebResponse> response = request.GetResponseAsync();
        if (await Task.WhenAny(response, Task.Delay(2000)) != response)
        {
          request.Abort();
          return 0;
        }
        using (HttpWebResponse http = (HttpWebResponse)await response)
        {
          return (int)http.StatusCode;
        }
      }
      catch (WebException error)
      {
        HttpWebResponse http = error.Response as HttpWebResponse;
        if (http == null) return 0;
        using (http)
        {
          return (int)http.StatusCode;
        }
      }
      catch (InvalidOperationException)
      {
        return 0;
      }
    }

    /// <summary>The server's cheap health check, or the workspace on a server without one.</summary>
    private async Task<bool> Probe()
    {
      int code = healthMissing ? 404 : await Status(options.Origin + "/api/health");
      if (code == 404)
      {
        healthMissing = true;
        code = await Status(options.Origin + "/api/workspace");
      }
      return code >= 200 && code < 300;
    }

    private async void Tick()
    {
      if (ticking || quitting) return;
      ticking = true;
      try
      {
        bool alive = await Probe();
        DateTime now = DateTime.UtcNow;
        if (alive)
        {
          state = ServerState.Running;
        }
        else if (state == ServerState.PortUnavailable && child == null)
        {
          // Restarting cannot help until the port is free; the log says what to change.
        }
        else if (child != null)
        {
          state = (now - startingSince).TotalSeconds < Program.StartingBudget
            ? ServerState.Starting
            : ServerState.Stopped;
        }
        else
        {
          state = ServerState.Stopped;
        }
        if (state == ServerState.Stopped && child == null && !quitting &&
            (now - lastSpawnAt).TotalSeconds > Program.RespawnBackoff)
        {
          SpawnServer();
        }
        Refresh();
      }
      finally
      {
        ticking = false;
      }
    }

    private string NodeExecutable()
    {
      return options.Node.Length > 0 && File.Exists(options.Node) ? options.Node : "node";
    }

    private void SpawnServer()
    {
      if (!File.Exists(Path.Combine(options.Repo, "node_modules", "tsx", "dist", "loader.mjs"))) return;
      // One node with tsx's loader, found from the app folder it runs in: tsx's own CLI would
      // put a second node between the companion and the server.
      ProcessStartInfo info = new ProcessStartInfo(
        NodeExecutable(), "--import tsx " + Program.Quote(Path.Combine("src", "server", "main.ts")));
      info.WorkingDirectory = options.Repo;
      info.UseShellExecute = false;
      // No console window: the server and every program it starts share one that is hidden.
      info.CreateNoWindow = true;
      // Closing standard input is how the server is asked to stop: Windows has no signal for it.
      info.RedirectStandardInput = true;
      info.RedirectStandardOutput = true;
      info.RedirectStandardError = true;
      info.StandardOutputEncoding = Encoding.UTF8;
      info.StandardErrorEncoding = Encoding.UTF8;
      info.EnvironmentVariables["OH_MY_PAPER_STOP_ON_STDIN_EOF"] = "1";
      Process process = new Process();
      process.StartInfo = info;
      process.EnableRaisingEvents = true;
      process.OutputDataReceived += (sender, e) => { if (e.Data != null) Program.Log(e.Data); };
      process.ErrorDataReceived += (sender, e) => { if (e.Data != null) Program.Log(e.Data); };
      process.Exited += (sender, e) => ui.Post(_ =>
      {
        int code = -1;
        try
        {
          code = process.ExitCode;
        }
        catch (InvalidOperationException)
        {
        }
        Program.Log("[tray] the server ended (" + code + ")");
        if (child == process) child = null;
        if (code == Program.PortUnavailableExitCode) state = ServerState.PortUnavailable;
        Refresh();
        Tick();
      }, null);
      try
      {
        process.Start();
        KillOnCloseJob.Add(process);
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        child = process;
        state = ServerState.Starting;
        startingSince = DateTime.UtcNow;
        lastSpawnAt = startingSince;
        Program.Log("[tray] started the server (" + NodeExecutable() + ")");
      }
      catch (Exception error)
      {
        lastSpawnAt = DateTime.UtcNow;
        state = ServerState.Stopped;
        Program.Log("[tray] could not start the server: " + error.Message);
      }
    }

    private string StatusLabel()
    {
      switch (state)
      {
        case ServerState.Running:
          return Program.Text("서버 실행 중", "Server running") + " — " + options.Origin;
        case ServerState.Starting:
          return Program.Text("서버 시작 중…", "Server starting…");
        case ServerState.PortUnavailable:
          return Program.Text("포트 " + options.Port + "을 쓸 수 없습니다 — 로그를 보세요",
            "Port " + options.Port + " is unavailable — see the log");
        default:
          return Program.Text("서버 중지됨", "Server stopped");
      }
    }

    private void Refresh()
    {
      statusItem.Text = "oh-my-paper — " + StatusLabel();
      openItem.Enabled = state == ServerState.Running;
      loginItem.Checked = Program.LoginItemEnabled();
      string tip = "oh-my-paper — " + StatusLabel();
      // The notification area keeps a tooltip under 64 characters.
      icon.Text = tip.Length > 63 ? tip.Substring(0, 63) : tip;
      icon.Icon = state == ServerState.Running ? runningIcon : idleIcon;
    }

    private void OpenReader()
    {
      if (state != ServerState.Running) return;
      try
      {
        Process.Start(new ProcessStartInfo(options.Origin) { UseShellExecute = true });
      }
      catch (Exception error)
      {
        Program.Log("[tray] could not open the browser: " + error.Message);
      }
    }

    private void ToggleLogin()
    {
      try
      {
        if (Program.LoginItemEnabled()) Program.RemoveLoginItem();
        else Program.WriteLoginItem(options);
      }
      catch (Exception error)
      {
        Program.Log("[tray] could not change the sign-in start: " + error.Message);
      }
      Refresh();
    }

    /// <summary>
    /// Stops the server the companion started: its standard input closes, which it answers by
    /// closing the library and leaving, and whatever still runs after `waitMs` is ended with
    /// everything it started.
    /// </summary>
    private void StopServer(int waitMs)
    {
      Process running = child;
      child = null;
      if (running == null) return;
      try
      {
        if (running.HasExited) return;
        try
        {
          running.StandardInput.Close();
        }
        catch (Exception)
        {
        }
        if (running.WaitForExit(waitMs)) return;
        ProcessStartInfo kill = new ProcessStartInfo(
          "taskkill.exe", "/PID " + running.Id.ToString(CultureInfo.InvariantCulture) + " /T /F");
        kill.UseShellExecute = false;
        kill.CreateNoWindow = true;
        using (Process taskkill = Process.Start(kill))
        {
          taskkill.WaitForExit(10000);
        }
      }
      catch (Exception error)
      {
        Program.Log("[tray] could not stop the server: " + error.Message);
      }
    }

    private void Quit()
    {
      if (quitting) return;
      quitting = true;
      timer.Stop();
      statusItem.Text = "oh-my-paper — " + Program.Text("끄는 중…", "Quitting…");
      StopServer(8000);
      icon.Visible = false;
      ExitThread();
    }

    protected override void Dispose(bool disposing)
    {
      if (disposing)
      {
        quitWait.Unregister(null);
        timer.Dispose();
        icon.Dispose();
      }
      base.Dispose(disposing);
    }
  }
}
