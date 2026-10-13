import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ProductImageField,
  validateAndCompressProductImage,
  resolveImageMime,
  sniffImageFormat,
  MAX_IMAGE_FILE_SIZE_BYTES,
} from "@/features/catalog/product-image-field";

/** Builds a File from raw magic bytes, bypassing any MIME declaration. */
function fileFromBytes(bytes: number[], name: string): File {
  return new File([new Uint8Array(bytes)], name, { type: "" });
}

describe("ProductImageField — security & format validation (S3)", () => {
  it("rejects non-allowlisted MIME types (SVG, PDF, text)", async () => {
    const invalidFile = new File(["<svg></svg>"], "test.svg", {
      type: "image/svg+xml",
    });

    await expect(validateAndCompressProductImage(invalidFile)).rejects.toThrow(
      /Formato no permitido/i,
    );
  });

  it("rejects files exceeding the 2 MB maximum size threshold", async () => {
    const largeContent = new Uint8Array(MAX_IMAGE_FILE_SIZE_BYTES + 1024);
    const largeFile = new File([largeContent], "huge.jpg", {
      type: "image/jpeg",
    });

    await expect(validateAndCompressProductImage(largeFile)).rejects.toThrow(
      /El archivo es muy pesado/i,
    );
  });

  it("renders empty placeholder when no image value is provided", () => {
    const onChange = vi.fn();
    render(<ProductImageField value={null} onChange={onChange} />);

    expect(screen.getByText(/Subir foto/i)).toBeInTheDocument();
    expect(screen.queryByTestId("product-image-preview")).not.toBeInTheDocument();
    expect(screen.queryByTestId("remove-product-image-button")).not.toBeInTheDocument();
  });

  it("renders preview and remove button when image value is provided", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ProductImageField
        value="data:image/webp;base64,mockValidData"
        onChange={onChange}
      />,
    );

    const preview = screen.getByTestId("product-image-preview");
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveAttribute("src", "data:image/webp;base64,mockValidData");

    const removeBtn = screen.getByTestId("remove-product-image-button");
    expect(removeBtn).toBeInTheDocument();

    await user.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  // JPEG acceptance (reported defect): several OS/browser combos report .jpg
  // files with the non-canonical alias "image/jpg" or with an EMPTY file.type
  // (no OS registry mapping). The strict includes(file.type) check rejected
  // both, so real JPEGs never reached the compressor.
  it("accepts JPEG files reported with the image/jpg MIME alias", () => {
    const file = new File(["jpeg"], "photo.jpg", { type: "image/jpg" });
    expect(resolveImageMime(file)).toBe("image/jpeg");
  });

  it("accepts JPEG files whose MIME type is empty by falling back to the extension", () => {
    const file = new File(["jpeg"], "photo.jpg", { type: "" });
    expect(resolveImageMime(file)).toBe("image/jpeg");

    const altFile = new File(["jpeg"], "photo.JPEG", { type: "" });
    expect(resolveImageMime(altFile)).toBe("image/jpeg");
  });

  it("resolves png and webp extensions when MIME type is empty", () => {
    expect(resolveImageMime(new File(["png"], "shot.png", { type: "" }))).toBe(
      "image/png",
    );
    expect(
      resolveImageMime(new File(["webp"], "shot.webp", { type: "" })),
    ).toBe("image/webp");
  });

  it("still rejects unknown types and unknown extensions with empty MIME", async () => {
    // Unresolvable: no MIME and no known image extension.
    expect(
      resolveImageMime(new File(["x"], "doc.pdf", { type: "" })),
    ).toBeNull();

    // Resolvable but outside the allowlist: the compression gate rejects them.
    await expect(
      validateAndCompressProductImage(
        new File(["x"], "anim.gif", { type: "image/gif" }),
      ),
    ).rejects.toThrow(/Formato no permitido/i);
    await expect(
      validateAndCompressProductImage(
        new File(["x"], "vector.svg", { type: "image/svg+xml" }),
      ),
    ).rejects.toThrow(/Formato no permitido/i);
  });

  // Magic-byte diagnosis (reported defect): a downloaded "images (9).jpeg"
  // failed with the opaque "No se pudo leer el archivo de imagen" because the
  // browser could not DECODE it — the classic cause is an iPhone HEIC/HEIF
  // payload carrying a .jpeg extension. The gates (MIME, size) passed; the
  // failure surfaced only at Image.onerror with no actionable message.
  it("sniffs the real format from magic bytes regardless of declared MIME", async () => {
    const jpeg = fileFromBytes(
      [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46],
      "photo.jpeg",
    );
    await expect(sniffImageFormat(jpeg)).resolves.toBe("jpeg");

    const png = fileFromBytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      "photo.png",
    );
    await expect(sniffImageFormat(png)).resolves.toBe("png");

    const webp = fileFromBytes(
      [
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50,
      ],
      "photo.webp",
    );
    await expect(sniffImageFormat(webp)).resolves.toBe("webp");
  });

  it("identifies HEIC/HEIF payloads disguised with a .jpeg extension", async () => {
    // ISO-BMFF: size + 'ftyp' + brand 'heic' — the iPhone camera format.
    const heic = fileFromBytes(
      [
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
        0x68, 0x65, 0x69, 0x63,
      ],
      "images (9).jpeg",
    );
    await expect(sniffImageFormat(heic)).resolves.toBe("heic");
  });

  it("rejects a HEIC payload named .jpeg with an actionable Spanish message", async () => {
    const heic = fileFromBytes(
      [
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
        0x68, 0x65, 0x69, 0x63,
      ],
      "images (9).jpeg",
    );

    await expect(validateAndCompressProductImage(heic)).rejects.toThrow(
      /HEIC/i,
    );
  });

  it("rejects payloads whose magic bytes match no allowed image format", async () => {
    const garbage = fileFromBytes(
      [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34],
      "image.jpeg",
    );

    await expect(validateAndCompressProductImage(garbage)).rejects.toThrow(
      /no es una imagen JPG, PNG o WebP v\u00e1lida/i,
    );
  });
});
